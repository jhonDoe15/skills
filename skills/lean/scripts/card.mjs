#!/usr/bin/env node
// Emits the lean/admino prompt card. That is the whole job.
//
// The skills steer by prompting: the rules live in the text this prints, not in
// code that grants or denies permission. This script exists only because a hook
// needs an executable to call, and because the tier table has to be filled in
// from whatever models the user configured.
//
// Node, not Python: no single Python command name works everywhere -- macOS
// 12.3+ dropped `python`, Windows ships no `python3`. Node is present wherever
// this installs, since Claude Code is a Node app and `npx skills add` needs it.
//
// Runs on every user prompt and again after a compaction. It never throws and
// never exits non-zero -- a broken card must not break the session.
//
//     card.mjs                 emit the card (reads the hook payload on stdin)
//     card.mjs --show          same, for reading by eye
//     card.mjs --write <path>  write it into a rules file a host always loads
//     card.mjs --cfg "k=v;..." fold install-time answers over the config
//     card.mjs --install-hook   register it in settings.json (npx skills add path)

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLED = join(SKILL_ROOT, "lean.config.json");

const DEFAULTS = {
  transport: "auto",
  host: "auto",
  order: ["cheap", "mid", "main"],
  tiers: {
    cheap: { effort: "medium", models: { "codex-cli": "gpt-5.6-luna" } },
    mid: { effort: "medium", models: { "codex-cli": "gpt-5.6-terra" } },
    main: { effort: "medium", models: { "codex-cli": "claude-opus-5" } },
  },
  routes: { settled: "cheap", local: "mid", design: "main", risk: "main" },
  response: { density: "default" },
  min_steps_to_delegate: 2,
};

const WHEN = {
  settled: "approach, area and validation known; the work is mechanical",
  local: "outcome known; needs repo investigation or a choice among existing patterns",
  design: "behaviour still open, or a correctness-sensitive area",
};

const TIER_ALIAS = { main: "main", sub: "cheap", cheap: "cheap", mid: "mid" };

// A multi-provider IDE already has every model behind one subagent mechanism, so
// use it -- that is also the only shape that keeps the main context small. A
// single-provider CLI has to choose: same-provider tiers, or shell out.
const HOST_TRANSPORT = {
  cursor: "unified",
  opencode: "unified",
  "claude-code": "claude-native",
  codex: "claude-native",
  unknown: "claude-native",
};

// How to actually dispatch, per transport. This script only picks which of these
// strings to print -- the model reads it and does the spawning. Override any of
// them under "spawn" in lean.config.json to point at a different CLI.
const SPAWN_TEXT = {
  "claude-native": [
    "Task tool, subagent_type=general-purpose, model set to the tier's model above.",
    "Pin it -- inherited means you pay top-tier prices for cheap-tier work.",
  ],
  unified: [
    "your harness's own subagent, model pinned to the tier above. Pin it explicitly --",
    "an inherited model leaves the ladder doing nothing while looking like it worked.",
  ],
  "codex-cli": [
    "write the brief to a file, then run:",
    "  codex exec -m <tier model> -c model_reasoning_effort=<effort> \\",
    "    --sandbox workspace-write - < brief.md",
    "Its final message is the report. Without --sandbox it cannot write and returns",
    "plausible work having changed nothing.",
  ],
};

/** User config wins, then project, then the copy bundled with the skill.
 *  The bundled file is a read-only default -- a plugin directory is a cache that
 *  is replaced on update, so the user's model choices cannot live there. */
function loadConfig() {
  const candidates = [];
  if (process.env.CLAUDE_LEAN_CONFIG) candidates.push(process.env.CLAUDE_LEAN_CONFIG);
  candidates.push(join(process.cwd(), ".claude", "lean.config.json"),
                  join(homedir(), ".claude", "lean.config.json"),
                  BUNDLED);
  for (const path of candidates) {
    try {
      if (existsSync(path) && statSync(path).isFile()) {
        return { ...DEFAULTS, ...JSON.parse(readFileSync(path, "utf8")) };
      }
    } catch { /* try the next candidate */ }
  }
  return { ...DEFAULTS };
}

/** Fold `--cfg k=v;k=v` over the file config.
 *  The hook passes install-time answers this way. Values that are blank, or
 *  still carrying an unsubstituted ${...} placeholder because the user skipped a
 *  prompt, are ignored -- a skipped prompt must leave the file config alone
 *  rather than blank the model id. */
function applyOverrides(cfg, raw) {
  for (const pair of (raw || "").split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (!key || !val || val.includes("${")) continue;

    if (key === "transport") {
      cfg.transport = val;
    } else if (key === "density") {
      cfg.response = { ...(cfg.response || {}), density: val };
    } else if (key === "tiers" && (val === "2" || val === "3")) {
      cfg.order = val === "2" ? ["cheap", "main"] : ["cheap", "mid", "main"];
      cfg.routes = { settled: "cheap", design: "main", risk: "main",
                     local: val === "2" ? "main" : "mid" };
    } else if (key.endsWith("_model") || key.endsWith("_effort")) {
      const cut = key.lastIndexOf("_");
      const tier = TIER_ALIAS[key.slice(0, cut)];
      const field = key.slice(cut + 1);
      if (!tier || !cfg.tiers?.[tier]) continue;
      if (field === "effort") {
        cfg.tiers[tier].effort = val;
      } else {
        // One name, every transport: the user picked a model, not a
        // model-per-spawn-mechanism.
        const models = cfg.tiers[tier].models || { unified: "" };
        cfg.tiers[tier].models = Object.fromEntries(
          Object.keys(models).map((k) => [k, val]));
      }
    }
  }
  return cfg;
}

/** Reject a config that would render a plausible but wrong card.
 *  JS coerces where Python threw: a malformed `order` silently produced
 *  "undefined tiers" and a bogus ladder. Fail loudly so the degraded card fires
 *  and names the problem. */
function validate(cfg) {
  if (!Array.isArray(cfg.order) || cfg.order.length < 2)
    throw new TypeError("order must be an array of at least two tier names");
  if (!cfg.tiers || typeof cfg.tiers !== "object")
    throw new TypeError("tiers must be an object");
  for (const t of cfg.order)
    if (!cfg.tiers[t]) throw new TypeError(`tiers is missing "${t}", which order lists`);
  if (!cfg.routes || typeof cfg.routes !== "object")
    throw new TypeError("routes must be an object");
  return cfg;
}

/** Which agent harness is running this. Read-only sniffing of the environment. */
function detectHost() {
  const env = process.env;
  const keys = Object.keys(env);
  if (keys.some((k) => k.startsWith("CURSOR")) || env.TERM_PROGRAM === "Cursor") return "cursor";
  if (keys.some((k) => k.startsWith("CODEX")) || env.OPENAI_CODEX) return "codex";
  if (env.CLAUDECODE || keys.some((k) => k.startsWith("CLAUDE_CODE"))) return "claude-code";
  if (env.OPENCODE || env.OPENCODE_BIN) return "opencode";
  return "unknown";
}

function resolveTransport(cfg, host) {
  const t = cfg.transport ?? "auto";
  return t === "auto" ? (HOST_TRANSPORT[host] ?? "claude-native") : t;
}

function densityBlock(level) {
  if (level === "full") return ["[lean] density=full -- no compression this session."];
  const depth = level === "terse"
    ? "answer only; a reason only where omitting one misleads"
    : "answer + one line of why per non-obvious call; detail on request";
  return [
    `[lean] density=${level} | goal: the reader's scanning time, not the token count`,
    "  LEDE   open with the answer. A reader who stops at line one still has it -- and when",
    "         the answer is one line, that line is the whole response.",
    "  COVER  every item the answer needs. Compress depth, never breadth -- three of eight,",
    "         implied complete, is omission the reader cannot detect.",
    `  DEPTH  ${depth}`,
    "  KEEP   failures, skipped steps, assumptions, unverified claims -- and the work product",
    "         itself (code, docs, files you were asked for) at full length",
    "  SPEND  words on what the reader acts on. Preamble, recaps of your own message,",
    "         unrequested justification and untaken options earn none.",
    "  PLAIN  a short answer stays short: no header, no bullet, no supporting paragraph it",
    "         did not need. Structure answers complexity already there.",
    "  SHAPE  one idea per paragraph | sets become lists, identifier first | group by what the",
    "         reader must act on | headers carry information | prose for people, not JSON/YAML",
    "  ASK    a follow-up for depth is the dial working; one to uncover an omission is failure",
  ];
}

function routeBlock(cfg, host) {
  const { order, tiers, routes } = cfg;
  const tr = resolveTransport(cfg, host);
  const top = order[order.length - 1];
  let how = cfg.spawn?.[tr] || SPAWN_TEXT[tr] || SPAWN_TEXT["claude-native"];
  if (typeof how === "string") how = [how];

  const lines = [
    `[admino] ${order.length} tiers | ${host} -> ${tr} | route on the uncertainty left ` +
    "now, not the task's original size",
    `  SPAWN   ${how[0]}`,
    ...how.slice(1).map((ln) => `          ${ln}`),
  ];

  for (const signal of ["settled", "local", "design"]) {
    const tier = routes[signal] ?? top;
    const spec = tiers[tier] ?? {};
    // A missing id would otherwise print "?" and the agent would have nothing to
    // pin -- the ladder then quietly runs everything on the parent model.
    const model = spec.models?.[tr] || `UNSET: tiers.${tier}.models.${tr}`;
    const verb = tier === top ? "keep " : "-> " + tier;
    lines.push(`  ${signal.padEnd(8)}${verb.padEnd(10)}(${model}, ${spec.effort ?? "medium"})  ${WHEN[signal]}`);
  }

  lines.push(
    "  RISK    an edit that can itself break authn/authz, crypto, a migration, persistence,",
    `          a public contract or concurrency stays on ${top} however settled it looks. Not`,
    "          'the app has users' -- if that were the test everything would route here and",
    "          the ladder would never fire.",
    "  HOLD    once a scope has moved up it does not move back down; that call is already",
    "          made. Genuinely new scope may re-decide. Escalating on design or risk is",
    "          never blocked, whatever else this says.",
    `  WORTH   skip a handoff with under ${cfg.min_steps_to_delegate} steps of work left, or ` +
    "for anything you must",
    "          review line by line anyway. Breadth is its own signal -- long lists lose items",
    "          on cheaper tiers even when nothing is uncertain.",
    "  SEAM    switch only at a checkpoint: exploration done, approach settled, a coherent",
    "          patch landed, or validation changed the diagnosis. Never mid-edit.",
    "  HANDOFF objective, constraints, done so far, decisions and assumptions, files touched,",
    "          validation with exact results, remaining work, open risks, next tier.",
    "  Skill(admino) for the full doctrine.",
  );
  return lines;
}

/** Register this script as a hook in settings.json.
 *
 *  The plugin installer wires hooks itself. `npx skills add` does not -- it
 *  installs skill directories and has no way to register a hook -- so without
 *  this the card never fires on that path and the skill is inert.
 *
 *  Merges rather than replaces, and is idempotent: an entry already pointing at
 *  card.mjs is left alone. Backs up first, because this is the user's file. */
function installHook(scope) {
  const settings = scope === "project"
    ? join(process.cwd(), ".claude", "settings.json")
    : join(homedir(), ".claude", "settings.json");
  const self = fileURLToPath(import.meta.url);

  let cfg = {};
  if (existsSync(settings)) {
    const before = readFileSync(settings, "utf8");
    try {
      cfg = JSON.parse(before);
    } catch (e) {
      process.stdout.write(`refusing to touch ${settings}: it is not valid JSON (${e.message})\n`);
      return 1;
    }
    writeFileSync(settings + ".bak", before, "utf8");
  }

  cfg.hooks ??= {};
  let added = 0;
  for (const event of ["UserPromptSubmit", "PostCompact"]) {
    cfg.hooks[event] ??= [];
    const already = JSON.stringify(cfg.hooks[event]).includes("card.mjs");
    if (already) continue;
    cfg.hooks[event].push({
      hooks: [{ type: "command", command: "node", args: [self], timeout: 10, statusMessage: "lean" }],
    });
    added++;
  }

  writeFileSync(settings, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  process.stdout.write(added
    ? `hook registered in ${settings} (${added} event${added > 1 ? "s" : ""}); backup at ${settings}.bak\n`
      + "Restart the session, or the card will not appear until the next one.\n"
    : `already registered in ${settings}; nothing changed\n`);
  return 0;
}

function argAfter(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i < process.argv.length - 1 ? process.argv[i + 1] : "";
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  try {
    if (process.argv.includes("--install-hook")) {
      return installHook(process.argv.includes("--project") ? "project" : "user");
    }
    let payload = {};
    if (!process.argv.includes("--show") && !process.stdin.isTTY) {
      const raw = readStdin();
      if (raw.trim()) payload = JSON.parse(raw);
    }
    if (payload.cwd) process.chdir(payload.cwd);

    const cfg = validate(applyOverrides(loadConfig(), argAfter("--cfg")));
    const host = cfg.host && cfg.host !== "auto" ? cfg.host : detectHost();
    const level = cfg.response?.density ?? "default";
    const card = [...densityBlock(level), "", ...routeBlock(cfg, host)].join("\n");

    const dest = argAfter("--write");
    if (dest) {
      // For hosts whose hooks never fire: write the resolved card straight into
      // a rules file the host does load.
      writeFileSync(dest, card + "\n", "utf8");
      process.stdout.write(`card written to ${dest} (host=${host})\n`);
    } else {
      process.stdout.write(card + "\n");
    }
  } catch (err) {
    // Never break the session -- but never fail silently either. An empty card is
    // indistinguishable from the skill not being installed, which is how a bug
    // here survives unnoticed. Degrade to the rules that need no config.
    try {
      process.stdout.write(densityBlock("default").join("\n") + "\n");
      process.stdout.write(`\n[admino] card degraded: ${err?.name}: ${err?.message}\n`);
      process.stdout.write("  Routing table unavailable -- check lean.config.json.\n");
    } catch { /* nothing left to do */ }
  }
  return 0;
}

process.exitCode = main();
