#!/usr/bin/env python3
"""Engine for the `lean` skill: tier routing plus response density.

The doctrine (SKILL.md) says *what* each tier is for and *how much* to say.
This file decides the parts that are rules rather than judgement calls --
whether a tier switch is allowed, and which density is in force -- because an
agent that forgets a ban or re-estimates its own budget mid-task is exactly
the failure the skill exists to prevent.

Every command prints a short human/agent-readable block and exits 0. `card`
never raises under any circumstance -- it runs on every user prompt.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SKILL_ROOT = Path(__file__).resolve().parent.parent
UNCERTAINTY = ("settled", "local", "design")
DENSITY = ("terse", "default", "full")


# --------------------------------------------------------------------------
# config + state
# --------------------------------------------------------------------------

def load_config() -> dict:
    path = Path(os.environ.get("CLAUDE_LEAN_CONFIG", SKILL_ROOT / "lean.config.json"))
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def project_root(hook_cwd: str | None = None) -> Path:
    """Where the ledger lives: the user's project, never the skill's own directory.

    Installed as a plugin the skill sits outside the project entirely, so deriving
    the root from SKILL_ROOT would write the ledger into the plugin cache. The hook
    payload carries cwd; a CLI call falls back to the shell's cwd, which is the
    project root in both install shapes.
    """
    for candidate in (hook_cwd, os.environ.get("CLAUDE_PROJECT_DIR")):
        if candidate:
            return Path(candidate)
    return Path.cwd()


def state_path(cfg: dict, _sid: str = "", hook_cwd: str | None = None) -> Path:
    """One ledger per project, not per session.

    The hook knows the session id but a `route.py` call from the Bash tool does
    not, so keying on session would leave the card reading a different file from
    the one the agent writes. One ledger also matches the doctrine: one routed
    task, one writing agent at a time.
    """
    return project_root(hook_cwd) / cfg.get("state_dir", ".claude/.lean") / "ledger.json"


def session_id() -> str:
    return os.environ.get("CLAUDE_SESSION_ID") or "default"


def load_state(cfg: dict, sid: str, hook_cwd: str | None = None) -> dict:
    path = state_path(cfg, sid, hook_cwd)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"session_id": sid, "task": None, "scopes": {}, "active_scope": None,
            "total_hops": 0, "closed": []}


def save_state(cfg: dict, state: dict, sid: str, hook_cwd: str | None = None) -> None:
    path = state_path(cfg, sid, hook_cwd)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def slug(text: str, n: int = 40) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return (s[:n] or "scope").strip("-")


# --------------------------------------------------------------------------
# the rules
# --------------------------------------------------------------------------

def recommend(uncertainty: str, risk: bool) -> tuple[str, str]:
    """Pick a tier from what is still unknown -- never from how big the task was."""
    if risk:
        return "main", "correctness-sensitive area (concurrency/security/persistence/compat/data)"
    if uncertainty == "design":
        return "main", "the correct behaviour or design is still open"
    if uncertainty == "local":
        return "mid", "outcome known, repo-specific investigation or pattern choice remains"
    return "cheap", "approach, area and validation are settled; remaining decisions are mechanical"


def evaluate(cfg: dict, scope: dict | None, target: str, uncertainty: str,
             remaining: int, risk: bool) -> dict:
    """Allow or deny a proposed move to `target`. Pure function over ledger state."""
    gates = cfg["gates"]
    policy = cfg.get("policy", {})
    order = cfg["order"]
    current = (scope or {}).get("tier")
    safety_valve = bool(policy.get("escalation_to_main_always_allowed", True)) \
        and target == "main" and (risk or uncertainty == "design")

    def verdict(ok, kind, why, **extra):
        return dict(allowed=ok, kind=kind, target=target, current=current, why=why, **extra)

    if current is None:
        return verdict(True, "assign", "fresh scope; first delegation creates no ban")

    if current == target:
        return verdict(False, "stay", f"already on {target}; nothing to hand off")

    # Capability floor. Direction is irrelevant: what matters is whether the target
    # tier can carry the uncertainty that is actually left. main->mid is a normal
    # delegation, not a "downshift" to be policed.
    rec, _ = recommend(uncertainty, risk)
    if order.index(target) < order.index(rec):
        return verdict(False, "under-tiered", (
            f"{target} sits below what this work needs. uncertainty='{uncertainty}'"
            f"{' + risk flag' if risk else ''} calls for {rec}. Resolve the open question first, "
            f"then {target} can take the mechanical remainder."))

    hops_scope = len((scope or {}).get("hops", []))
    if hops_scope >= gates["max_hops_per_scope"] and not safety_valve:
        return verdict(False, "budget", (
            f"scope hop budget spent ({hops_scope}/{gates['max_hops_per_scope']}). "
            "Finish in the current tier, or return to main if genuinely blocked."))

    if [current, target] in [list(b) for b in (scope or {}).get("bans", [])]:
        if safety_valve:
            return verdict(True, "return", "banned pair overridden: escalation to main on design/risk is never blocked")
        return verdict(False, "banned", (
            f"{current}->{target} was already decided against for this scope "
            f"(you came {target}->{current}). Bouncing back re-pays the handoff for a call "
            "you already made. Open a new scope only if the work genuinely changed."))

    up = order.index(target) > order.index(current)
    need = gates["min_remaining_upshift"] if up else gates["min_remaining_downshift"]
    if remaining < need:
        if safety_valve:
            return verdict(True, "return", "too little work left to justify a switch, but correctness outranks cost")
        return verdict(False, "not-worth-it", (
            f"{remaining} step(s) left; {'upshift' if up else 'downshift'} needs >= {need}. "
            "The handoff costs more than the remaining work saves -- let the current tier finish."))

    why = "gates clear: enough work left, no ban, tier carries the remaining uncertainty"
    if order.index(target) > order.index(rec):
        why += (f"  NOTE: {rec} would suffice for '{uncertainty}' work -- only spend {target} "
                "if you also intend judgement or review here.")
    return verdict(True, "return" if target == "main" else "hop", why)


def apply_move(cfg: dict, state: dict, scope_id: str, v: dict, uncertainty: str,
               remaining: int, risk: bool, note: str) -> dict:
    scopes = state.setdefault("scopes", {})
    scope = scopes.setdefault(scope_id, {"opened": now(), "tier": None, "hops": [], "bans": []})
    entry = {"from": scope.get("tier"), "to": v["target"], "kind": v["kind"],
             "uncertainty": uncertainty, "risk": risk, "remaining": remaining,
             "at": now(), "note": note or ""}
    scope["hops"].append(entry)
    # A hop X->Y bars the reverse Y->X for this scope: the call was already made.
    # Returns to main are checkpoints, not tier commitments, so they bar nothing.
    if v["kind"] == "hop" and scope.get("tier"):
        pair = [v["target"], scope["tier"]]
        if pair not in [list(b) for b in scope["bans"]]:
            scope["bans"].append(pair)
    scope["tier"] = v["target"]
    scope["remaining"] = remaining
    state["active_scope"] = scope_id
    state["total_hops"] = state.get("total_hops", 0) + (1 if v["kind"] != "assign" else 0)
    return entry


# --------------------------------------------------------------------------
# rendering
# --------------------------------------------------------------------------

def tier_desc(cfg: dict, tier: str) -> str:
    t = cfg["tiers"][tier]
    model = t["models"].get(cfg["transport"], "?")
    return f"{tier} ({t['label']}, {model}, effort={t['effort']})"


def active_density(cfg: dict, state: dict) -> str:
    """Session override beats the configured default."""
    level = state.get("density") or cfg.get("response", {}).get("density", "default")
    return level if level in DENSITY else "default"


def render_density(cfg: dict, state: dict) -> list[str]:
    level = active_density(cfg, state)
    if level == "full":
        return ["[lean] density=full -- no compression this session."]

    depth = ("answer only; a reason only where omitting one misleads"
             if level == "terse" else
             "answer + one line of why per non-obvious call; detail on request")
    # Rendered in the shape the doctrine asks for: labelled left edge, one idea per
    # line, so the model can scan it the way it is being told to write.
    return [
        f"[lean] density={level} | goal: the reader's scanning time, not the token count",
        "  COVER  every item the answer needs. Compress depth, never breadth -- naming three of",
        "         eight and implying completeness is omission, and the reader cannot detect it.",
        f"  DEPTH  {depth}",
        "  KEEP   failures, skipped steps, assumptions, unverified claims. And the work product",
        "         itself -- code, docs, commits, files you were asked for -- at full length.",
        "  CUT    preamble, recaps of your own message, unrequested justification, options not taken",
        "  SHAPE  answer in the first line | one idea per paragraph | sets become lists, identifier",
        "         first | group by what the reader must act on | headers carry information | prose,",
        "         never JSON/YAML | no ceremony on a short answer",
        "  ASK    a follow-up for more depth is the dial working; one needed to uncover something",
        "         you omitted is the failure",
    ]


def render_card(cfg: dict, state: dict) -> str:
    tr = cfg["transport"]
    scope_id = state.get("active_scope")
    scope = (state.get("scopes") or {}).get(scope_id or "")
    lines = render_density(cfg, state) + [""]

    if not scope:
        lines += [
            f"[route] {tr} | idle | route on the uncertainty left now, not the task's original size",
            f"  settled -> {tier_desc(cfg, 'cheap')}  approach, area, validation all known; work is mechanical",
            f"  local   -> {tier_desc(cfg, 'mid')}  outcome known; needs repo investigation or a pattern choice",
            f"  design  -> keep {tier_desc(cfg, 'main')}  behaviour still open, or correctness-sensitive area",
            f"  Skip delegation under {cfg['gates']['min_remaining_upshift']} steps, or for work you must review line by line anyway.",
            "  route.py open --objective \"...\" to start | Skill(lean) for the doctrine",
        ]
        return "\n".join(lines)

    hops = scope.get("hops", [])
    g = cfg["gates"]
    lines.append(f"[route] scope={scope_id} | on {tier_desc(cfg, scope['tier'])} "
                 f"| hops {len(hops)}/{g['max_hops_per_scope']} scope, "
                 f"{state.get('total_hops', 0)}/{g['max_hops_per_task']} task")
    if hops:
        h = hops[-1]
        lines.append(f"  last: {h['from'] or 'main'}->{h['to']} ({h['kind']}, {h['uncertainty']}, "
                     f"{h['remaining']} left){(' - ' + h['note']) if h.get('note') else ''}")
    bans = scope.get("bans", [])
    if bans:
        lines.append("  BANNED this scope: " + ", ".join(f"{a}->{b}" for a, b in bans)
                     + "  (escalation to main on design/risk still allowed)")
    if len(state.get("scopes", {})) > 4:
        lines.append(f"  WARNING: {len(state['scopes'])} scopes opened this task. New scopes reset bans -- "
                     "opening one to dodge a ban is the failure mode this ledger exists to catch.")
    lines += [
        "  Reassess only at a checkpoint: exploration done, approach settled, coherent patch, or a",
        "  validation result that changes the diagnosis. Never reroute mid-edit.",
        "  Check before switching: scripts/route.py decide --scope <id> --uncertainty settled|local|design "
        "--remaining N [--risk]",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------

def cmd_card(args) -> int:
    """Runs on every user prompt. Must never fail, never block, never be noisy."""
    try:
        payload = {}
        if not sys.stdin.isatty():
            raw = sys.stdin.read()
            if raw.strip():
                payload = json.loads(raw)
        cfg = load_config()
        sid = payload.get("session_id") or session_id()
        state = load_state(cfg, sid, payload.get("cwd"))
        print(render_card(cfg, state))
    except Exception:
        pass  # a broken router must never break the session
    return 0


def cmd_open(args) -> int:
    cfg = load_config()
    sid = session_id()
    state = load_state(cfg, sid)
    if state.get("task"):
        state.setdefault("closed", []).append(state["task"] | {"scopes": state.get("scopes", {})})
    state.update({"task": {"id": slug(args.objective, 32), "objective": args.objective, "opened": now()},
                  "scopes": {}, "active_scope": None, "total_hops": 0})
    save_state(cfg, state, sid)
    print(f"task opened: {state['task']['id']}\n{args.objective}\n\n{render_card(cfg, state)}")
    return 0


def _decide(args, commit: bool) -> int:
    cfg = load_config()
    sid = session_id()
    state = load_state(cfg, sid)
    scope_id = slug(args.scope)
    scope = (state.get("scopes") or {}).get(scope_id)
    target = args.to or recommend(args.uncertainty, args.risk)[0]
    _, why_tier = recommend(args.uncertainty, args.risk)
    v = evaluate(cfg, scope, target, args.uncertainty, args.remaining, args.risk)

    print(f"scope      : {scope_id}" + ("" if scope else "  (new)"))
    print(f"current    : {v['current'] or 'main (undelegated)'}")
    print(f"recommended: {tier_desc(cfg, target)}")
    print(f"rationale  : {why_tier}")
    print(f"verdict    : {'ALLOW' if v['allowed'] else 'DENY'}  [{v['kind']}]")
    print(f"reason     : {v['why']}")

    if not v["allowed"]:
        print("\naction     : stay on " + (v["current"] or "main") + " and finish the current checkpoint.")
        return 0
    if not commit:
        print("\naction     : re-run with `commit` (same flags) once you are at a checkpoint, then spawn.")
        return 0

    if not state.get("task"):
        state["task"] = {"id": scope_id, "objective": args.note or scope_id, "opened": now()}
    if state.get("total_hops", 0) >= cfg["gates"]["max_hops_per_task"] and target != "main":
        print("\nDENY: task hop budget exhausted. Finish on the current tier or return to main.")
        return 0
    entry = apply_move(cfg, state, scope_id, v, args.uncertainty, args.remaining, args.risk, args.note or "")
    save_state(cfg, state, sid)
    print(f"\ncommitted  : {entry['from'] or 'main'} -> {entry['to']} ({entry['kind']})")
    print(f"next       : write the handoff (references/handoff.md), then "
          f"scripts/route.py spawn --tier {target} --prompt-file <file>")
    return 0


def cmd_spawn(args) -> int:
    cfg = load_config()
    tier, tr = cfg["tiers"][args.tier], cfg["transport"]
    model, effort = tier["models"][tr], tier["effort"]
    cwd = str(project_root())

    if tr == "codex-cli":
        t = cfg["transports"]["codex-cli"]
        if args.prompt_file:
            cmd = t["prompt_file_template"].format(model=model, effort=effort, cwd=cwd,
                                                   prompt_file=args.prompt_file)
        else:
            cmd = t["command_template"].format(model=model, effort=effort, cwd=cwd,
                                               prompt=(args.prompt or "").replace('"', '\\"'))
        print(f"Run this with the Bash tool (POSIX quoting; it shares this working tree):\n\n{cmd}\n")
        print("The subagent edits files directly. Read its final message as the handoff, then run "
              "`route.py decide` again before the next phase.")
        return 0

    directive = cfg["transports"][tr].get("directive")
    print(f"transport : {tr}")
    print(f"spawn     : model={model} reasoning_effort={effort}  ({tier['label']}, tier={args.tier})")
    if directive == "agent-tool":
        print(f"mechanism : Agent tool, subagent_type=general-purpose, model={model}")
    else:
        print("mechanism : the harness's native subagent, with the model pinned to the value above. "
              "Do not let it inherit the parent model -- that silently defeats the routing.")
    print(f"prompt    : contents of {args.prompt_file or '<inline>'} "
          "(objective + constraints + handoff + return contract)")
    return 0


def cmd_density(args) -> int:
    cfg = load_config()
    sid = session_id()
    state = load_state(cfg, sid)
    if args.level:
        state["density"] = args.level
        save_state(cfg, state, sid)
    level = active_density(cfg, state)
    src = "session override" if state.get("density") else "config default"
    print(f"density: {level}  ({src})")
    print(cfg["response"]["levels"][level])
    if args.level:
        print("\nApplies from your next response. `route.py density default` restores the baseline.")
    return 0


def cmd_status(args) -> int:
    cfg = load_config()
    state = load_state(cfg, session_id())
    task = state.get("task")
    print(f"task   : {task['id'] + ' -- ' + task['objective'] if task else '(none)'}")
    print(f"hops   : {state.get('total_hops', 0)}/{cfg['gates']['max_hops_per_task']}")
    for sid_, sc in (state.get("scopes") or {}).items():
        mark = "*" if sid_ == state.get("active_scope") else " "
        print(f" {mark} {sid_}: tier={sc.get('tier')} hops={len(sc.get('hops', []))} "
              f"bans={['->'.join(b) for b in sc.get('bans', [])]}")
        for h in sc.get("hops", []):
            print(f"      {h['at']}  {h['from'] or 'main'}->{h['to']}  {h['kind']}  "
                  f"{h['uncertainty']} remaining={h['remaining']}  {h.get('note', '')}")
    return 0


def cmd_close(args) -> int:
    cfg = load_config()
    sid = session_id()
    state = load_state(cfg, sid)
    state["active_scope"] = None
    if state.get("task"):
        state["task"] = None
    save_state(cfg, state, sid)
    print("task closed. Router card returns to idle.")
    return 0


def cmd_doctor(args) -> int:
    ok = True
    try:
        cfg = load_config()
        print(f"config       : OK  transport={cfg['transport']}")
    except Exception as exc:
        print(f"config       : FAIL  {exc}")
        return 1

    for tier in cfg["order"]:
        try:
            print(f"tier {tier:<6}: {tier_desc(cfg, tier)}")
        except Exception as exc:
            ok = False
            print(f"tier {tier:<6}: FAIL  {exc}")

    try:
        p = state_path(cfg, "doctor-probe")
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("{}", encoding="utf-8")
        p.unlink()
        print(f"state dir    : OK  {p.parent}")
    except Exception as exc:
        ok = False
        print(f"state dir    : FAIL  {exc}")

    if cfg["transport"] == "codex-cli":
        probe = cfg["transports"]["codex-cli"]["probe"]
        try:
            r = subprocess.run(probe, shell=True, capture_output=True, text=True, timeout=30)
            if r.returncode == 0:
                print(f"codex cli    : OK  {(r.stdout or r.stderr).strip().splitlines()[0]}")
            else:
                ok = False
                print(f"codex cli    : FAIL  `{probe}` exited {r.returncode}. Install the Codex CLI and sign in.")
        except Exception as exc:
            ok = False
            print(f"codex cli    : FAIL  {exc}")
        print("model ids    : UNVERIFIED -- doctor cannot confirm a model id exists on your account.")
        print("               Run one throwaway `codex exec` per tier before trusting the routing.")
    else:
        print(f"transport    : {cfg['transport']} (native) -- nothing to probe; "
              "confirm the harness lets you pin a model per subagent.")

    print("\n" + ("all checks passed" if ok else "FIX THE FAILURES ABOVE before routing real work"))
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(prog="route.py", description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("card").set_defaults(fn=cmd_card)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    sub.add_parser("close").set_defaults(fn=cmd_close)
    sub.add_parser("doctor").set_defaults(fn=cmd_doctor)

    p = sub.add_parser("open"); p.add_argument("--objective", required=True); p.set_defaults(fn=cmd_open)

    p = sub.add_parser("density")
    p.add_argument("level", nargs="?", choices=DENSITY, help="omit to show the current level")
    p.set_defaults(fn=cmd_density)

    for name, commit in (("decide", False), ("commit", True)):
        p = sub.add_parser(name)
        p.add_argument("--scope", required=True, help="stable slug for the current scope")
        p.add_argument("--uncertainty", required=True, choices=UNCERTAINTY)
        p.add_argument("--remaining", required=True, type=int, help="estimated discrete steps left in this scope")
        p.add_argument("--risk", action="store_true", help="concurrency/security/persistence/compat/data-integrity")
        p.add_argument("--to", choices=("cheap", "mid", "main"), help="override the recommended tier")
        p.add_argument("--note", default="")
        p.set_defaults(fn=lambda a, c=commit: _decide(a, c))

    p = sub.add_parser("spawn")
    p.add_argument("--tier", required=True, choices=("cheap", "mid", "main"))
    p.add_argument("--prompt-file")
    p.add_argument("--prompt")
    p.set_defaults(fn=cmd_spawn)

    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
