#!/usr/bin/env python3
"""Emits the lean/admino prompt card. That is the whole job.

The skills steer by prompting: the rules live in the text this prints, not in
code that grants or denies permission. This script exists only because a hook
needs an executable to call, and because the tier table has to be filled in from
whatever models the user configured.

Runs on every user prompt and again after a compaction. It never raises and
never exits non-zero -- a broken card must not break the session.

    card.py            emit the card (reads the hook payload on stdin)
    card.py --show     same, for reading by eye
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SKILL_ROOT = Path(__file__).resolve().parent.parent
BUNDLED = SKILL_ROOT / "lean.config.json"

DEFAULTS = {
    "transport": "auto",
    "host": "auto",
    "order": ["cheap", "mid", "main"],
    "tiers": {
        "cheap": {"effort": "medium", "models": {"codex-cli": "gpt-5.6-luna"}},
        "mid": {"effort": "medium", "models": {"codex-cli": "gpt-5.6-terra"}},
        "main": {"effort": "medium", "models": {"codex-cli": "claude-opus-5"}},
    },
    "routes": {"settled": "cheap", "local": "mid", "design": "main", "risk": "main"},
    "response": {"density": "default"},
    "min_steps_to_delegate": 2,
}

WHEN = {
    "settled": "approach, area and validation known; the work is mechanical",
    "local": "outcome known; needs repo investigation or a choice among existing patterns",
    "design": "behaviour still open, or a correctness-sensitive area",
}


def load_config() -> dict:
    """User config wins, then project, then the copy bundled with the skill.

    The bundled file is a read-only default -- a plugin directory is a cache that
    is replaced on update, so the user's model choices cannot live there.
    """
    candidates = []
    if os.environ.get("CLAUDE_LEAN_CONFIG"):
        candidates.append(Path(os.environ["CLAUDE_LEAN_CONFIG"]))
    candidates += [Path.cwd() / ".claude" / "lean.config.json",
                   Path.home() / ".claude" / "lean.config.json",
                   BUNDLED]
    for path in candidates:
        try:
            if path.is_file():
                cfg = dict(DEFAULTS)
                cfg.update(json.loads(path.read_text(encoding="utf-8")))
                return cfg
        except Exception:
            continue
    return dict(DEFAULTS)


TIER_ALIAS = {"main": "main", "sub": "cheap", "cheap": "cheap", "mid": "mid"}


def apply_overrides(cfg: dict, raw: str) -> dict:
    """Fold `--cfg k=v;k=v` over the file config.

    The hook passes install-time answers this way. Values that are blank, or
    still carrying an unsubstituted ${...} placeholder because the user skipped
    a prompt, are ignored -- a skipped prompt must leave the file config alone
    rather than blank the model id.
    """
    for pair in (raw or "").split(";"):
        key, _, val = pair.partition("=")
        key, val = key.strip(), val.strip()
        if not key or not val or "${" in val:
            continue
        if key == "transport":
            cfg["transport"] = val
        elif key == "density":
            cfg.setdefault("response", {})["density"] = val
        elif key == "tiers" and val in ("2", "3"):
            cfg["order"] = ["cheap", "main"] if val == "2" else ["cheap", "mid", "main"]
            cfg["routes"] = {"settled": "cheap", "design": "main", "risk": "main",
                             "local": "main" if val == "2" else "mid"}
        elif key.endswith(("_model", "_effort")):
            name, _, field = key.rpartition("_")
            tier = TIER_ALIAS.get(name)
            if not tier or tier not in cfg.get("tiers", {}):
                continue
            if field == "effort":
                cfg["tiers"][tier]["effort"] = val
            else:
                # One name, every transport: the user picked a model, not a
                # model-per-spawn-mechanism.
                cfg["tiers"][tier]["models"] = {k: val for k in
                                                cfg["tiers"][tier].get("models", {"unified": ""})}
    return cfg


def detect_host() -> str:
    """Which agent harness is running this. Read-only sniffing of the environment."""
    env = os.environ
    if any(k.startswith("CURSOR") for k in env) or env.get("TERM_PROGRAM") == "Cursor":
        return "cursor"
    if any(k.startswith("CODEX") for k in env) or env.get("OPENAI_CODEX"):
        return "codex"
    if env.get("CLAUDECODE") or any(k.startswith("CLAUDE_CODE") for k in env):
        return "claude-code"
    if env.get("OPENCODE") or env.get("OPENCODE_BIN"):
        return "opencode"
    return "unknown"


# A multi-provider IDE already has every model behind one subagent mechanism, so
# use it -- that is also the only shape that keeps the main context small. A
# single-provider CLI has to choose: same-provider tiers, or shell out.
HOST_TRANSPORT = {
    "cursor": "unified",
    "opencode": "unified",
    "claude-code": "claude-native",
    "codex": "claude-native",
    "unknown": "claude-native",
}


def resolve_transport(cfg: dict, host: str) -> str:
    t = cfg.get("transport", "auto")
    return HOST_TRANSPORT.get(host, "claude-native") if t == "auto" else t


# How to actually dispatch, per transport. The script only picks which of these
# strings to print -- the model reads it and does the spawning. Override any of
# them under "spawn" in lean.config.json to point at a different CLI.
SPAWN_TEXT = {
    "claude-native": [
        "Task tool, subagent_type=general-purpose, model set to the tier's model above.",
        "Pin it -- inherited means you pay top-tier prices for cheap-tier work.",
    ],
    "unified": [
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
}


def density_block(level: str) -> list[str]:
    if level == "full":
        return ["[lean] density=full -- no compression this session."]
    depth = ("answer only; a reason only where omitting one misleads" if level == "terse"
             else "answer + one line of why per non-obvious call; detail on request")
    return [
        f"[lean] density={level} | goal: the reader's scanning time, not the token count",
        "  LEDE   open with the answer. A reader who stops at line one still has it -- and when",
        "         the answer is one line, that line is the whole response.",
        "  COVER  every item the answer needs. Compress depth, never breadth -- three of eight,",
        "         implied complete, is omission the reader cannot detect.",
        f"  DEPTH  {depth}",
        "  KEEP   failures, skipped steps, assumptions, unverified claims -- and the work product",
        "         itself (code, docs, files you were asked for) at full length",
        "  SPEND  words on what the reader acts on. Preamble, recaps of your own message,",
        "         unrequested justification and untaken options earn none.",
        "  PLAIN  a short answer stays short: no header, no bullet, no supporting paragraph it",
        "         did not need. Structure answers complexity already there.",
        "  SHAPE  one idea per paragraph | sets become lists, identifier first | group by what the",
        "         reader must act on | headers carry information | prose for people, not JSON/YAML",
        "  ASK    a follow-up for depth is the dial working; one to uncover an omission is failure",
    ]


def route_block(cfg: dict, host: str) -> list[str]:
    order, tiers, routes = cfg["order"], cfg["tiers"], cfg["routes"]
    tr = resolve_transport(cfg, host)
    top = order[-1]
    how = cfg.get("spawn", {}).get(tr) or SPAWN_TEXT.get(tr, SPAWN_TEXT["claude-native"])
    if isinstance(how, str):
        how = [how]
    lines = [f"[admino] {len(order)} tiers | {host} -> {tr} | route on the uncertainty left "
             "now, not the task's original size"]
    lines += [f"  SPAWN   {how[0]}"] + [f"          {ln}" for ln in how[1:]]
    for signal in ("settled", "local", "design"):
        tier = routes.get(signal, top)
        spec = tiers.get(tier, {})
        # A missing id would otherwise print "?" and the agent would have nothing
        # to pin -- the ladder then quietly runs everything on the parent model.
        model = spec.get("models", {}).get(tr) or f"UNSET: tiers.{tier}.models.{tr}"
        verb = "keep " if tier == top else "-> " + tier
        lines.append(f"  {signal:<8}{verb:<10}({model}, {spec.get('effort', 'medium')})  {WHEN[signal]}")
    lines += [
        "  RISK    an edit that can itself break authn/authz, crypto, a migration, persistence,",
        f"          a public contract or concurrency stays on {top} however settled it looks. Not",
        "          'the app has users' -- if that were the test everything would route here and",
        "          the ladder would never fire.",
        "  HOLD    once a scope has moved up it does not move back down; that call is already",
        "          made. Genuinely new scope may re-decide. Escalating on design or risk is",
        "          never blocked, whatever else this says.",
        f"  WORTH   skip a handoff with under {cfg['min_steps_to_delegate']} steps of work left, or "
        "for anything you must",
        "          review line by line anyway. Breadth is its own signal -- long lists lose items",
        "          on cheaper tiers even when nothing is uncertain.",
        "  SEAM    switch only at a checkpoint: exploration done, approach settled, a coherent",
        "          patch landed, or validation changed the diagnosis. Never mid-edit.",
        "  HANDOFF objective, constraints, done so far, decisions and assumptions, files touched,",
        "          validation with exact results, remaining work, open risks, next tier.",
        "  Skill(admino) for the full doctrine.",
    ]
    return lines


def arg_after(flag: str) -> str:
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv[:-1] else ""


def main() -> int:
    try:
        payload = {}
        if "--show" not in sys.argv and not sys.stdin.isatty():
            raw = sys.stdin.read()
            if raw.strip():
                payload = json.loads(raw)
        if payload.get("cwd"):
            os.chdir(payload["cwd"])
        cfg = apply_overrides(load_config(), arg_after("--cfg"))
        host = cfg.get("host") if cfg.get("host", "auto") != "auto" else detect_host()
        level = cfg.get("response", {}).get("density", "default")
        card = "\n".join(density_block(level) + [""] + route_block(cfg, host))
        dest = arg_after("--write")
        if dest:
            # For hosts whose hooks never fire: write the resolved card straight
            # into a rules file the host does load.
            Path(dest).write_text(card + "\n", encoding="utf-8")
            print(f"card written to {dest} (host={host})")
        else:
            print(card)
    except Exception as exc:
        # Never break the session -- but never fail silently either. An empty card
        # is indistinguishable from the skill not being installed, which is how a
        # bug here survives unnoticed. Degrade to the rules that need no config.
        try:
            print("\n".join(density_block("default")))
            print(f"\n[admino] card degraded: {type(exc).__name__}: {exc}")
            print("  Routing table unavailable -- check lean.config.json.")
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
