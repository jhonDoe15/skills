#!/usr/bin/env python3
"""Deterministic tests for the lean rule engine.

The routing half of this skill is pure rules over ledger state, so it gets real
tests rather than sampled model runs -- they are exact, free, and repeatable.
Only the density half (model behaviour) needs LLM evals.

These load the *shipped* lean.config.json rather than a fixture, so an edit that
makes the thresholds nonsensical fails here too.

    python .claude/skills/lean/tests/test_rules.py
"""

import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("route", SKILL / "scripts" / "route.py")
route = importlib.util.module_from_spec(spec)
spec.loader.exec_module(route)

CFG = route.load_config()


def scope(tier=None, hops=0, bans=()):
    return {"opened": "t", "tier": tier, "hops": [{}] * hops, "bans": [list(b) for b in bans]}


class Recommend(unittest.TestCase):
    """Tier follows the uncertainty that is left, never the size of the task."""

    def test_settled_is_cheap(self):
        self.assertEqual(route.recommend("settled", False)[0], "cheap")

    def test_local_is_mid(self):
        self.assertEqual(route.recommend("local", False)[0], "mid")

    def test_design_is_main(self):
        self.assertEqual(route.recommend("design", False)[0], "main")

    def test_risk_overrides_settled(self):
        self.assertEqual(route.recommend("settled", True)[0], "main")

    def test_risk_overrides_local(self):
        self.assertEqual(route.recommend("local", True)[0], "main")


class FirstDelegation(unittest.TestCase):
    def test_fresh_scope_is_an_assign(self):
        v = route.evaluate(CFG, None, "cheap", "settled", 8, False)
        self.assertTrue(v["allowed"])
        self.assertEqual(v["kind"], "assign")

    def test_same_tier_is_a_no_op(self):
        v = route.evaluate(CFG, scope("mid"), "mid", "local", 9, False)
        self.assertFalse(v["allowed"])
        self.assertEqual(v["kind"], "stay")


class CapabilityFloor(unittest.TestCase):
    """A tier is never handed uncertainty it cannot carry. Direction is irrelevant."""

    def test_cheap_cannot_take_local(self):
        v = route.evaluate(CFG, scope("mid"), "cheap", "local", 9, False)
        self.assertFalse(v["allowed"])
        self.assertEqual(v["kind"], "under-tiered")

    def test_cheap_cannot_take_design(self):
        v = route.evaluate(CFG, scope("main"), "cheap", "design", 9, False)
        self.assertFalse(v["allowed"])
        self.assertEqual(v["kind"], "under-tiered")

    def test_mid_cannot_take_risk(self):
        v = route.evaluate(CFG, scope("main"), "mid", "settled", 9, True)
        self.assertFalse(v["allowed"])
        self.assertEqual(v["kind"], "under-tiered")

    def test_main_to_mid_on_local_is_normal_delegation(self):
        """Regression: this was once refused as a 'premature downshift'."""
        v = route.evaluate(CFG, scope("main"), "mid", "local", 9, False)
        self.assertTrue(v["allowed"], v["why"])

    def test_over_tiering_is_allowed_but_flagged(self):
        v = route.evaluate(CFG, scope("cheap"), "main", "settled", 9, False)
        self.assertTrue(v["allowed"])
        self.assertIn("would suffice", v["why"])


class AntiOscillation(unittest.TestCase):
    def test_reverse_of_a_hop_is_banned(self):
        v = route.evaluate(CFG, scope("mid", hops=1, bans=[("mid", "cheap")]),
                           "cheap", "settled", 9, False)
        self.assertFalse(v["allowed"])
        self.assertEqual(v["kind"], "banned")

    def test_safety_valve_on_design(self):
        v = route.evaluate(CFG, scope("mid", hops=1, bans=[("mid", "main")]),
                           "main", "design", 9, False)
        self.assertTrue(v["allowed"], "escalation to main on design must never be blocked")

    def test_safety_valve_on_risk(self):
        v = route.evaluate(CFG, scope("mid", hops=1, bans=[("mid", "main")]),
                           "main", "settled", 9, True)
        self.assertTrue(v["allowed"])

    def test_no_valve_for_a_mere_cost_complaint(self):
        v = route.evaluate(CFG, scope("cheap", hops=1, bans=[("cheap", "main")]),
                           "main", "settled", 9, False)
        self.assertFalse(v["allowed"])


class RemainingWorkGate(unittest.TestCase):
    def test_upshift_below_threshold(self):
        n = CFG["gates"]["min_remaining_upshift"]
        v = route.evaluate(CFG, scope("cheap"), "mid", "local", n - 1, False)
        self.assertFalse(v["allowed"])
        self.assertEqual(v["kind"], "not-worth-it")

    def test_upshift_at_threshold(self):
        n = CFG["gates"]["min_remaining_upshift"]
        self.assertTrue(route.evaluate(CFG, scope("cheap"), "mid", "local", n, False)["allowed"])

    def test_downshift_needs_more_than_upshift(self):
        g = CFG["gates"]
        self.assertGreater(g["min_remaining_downshift"], g["min_remaining_upshift"],
                           "a downshift is an optimisation and must clear a higher bar")

    def test_downshift_below_threshold(self):
        n = CFG["gates"]["min_remaining_downshift"]
        v = route.evaluate(CFG, scope("mid"), "cheap", "settled", n - 1, False)
        self.assertFalse(v["allowed"])
        self.assertEqual(v["kind"], "not-worth-it")

    def test_downshift_at_threshold(self):
        n = CFG["gates"]["min_remaining_downshift"]
        self.assertTrue(route.evaluate(CFG, scope("mid"), "cheap", "settled", n, False)["allowed"])

    def test_valve_beats_the_gate(self):
        """One step left and a design question: correctness outranks cost."""
        self.assertTrue(route.evaluate(CFG, scope("cheap"), "main", "design", 1, False)["allowed"])


class HopBudget(unittest.TestCase):
    def test_exhausted_budget_denies(self):
        n = CFG["gates"]["max_hops_per_scope"]
        v = route.evaluate(CFG, scope("cheap", hops=n), "mid", "local", 9, False)
        self.assertFalse(v["allowed"])
        self.assertEqual(v["kind"], "budget")

    def test_valve_beats_the_budget(self):
        n = CFG["gates"]["max_hops_per_scope"]
        self.assertTrue(route.evaluate(CFG, scope("cheap", hops=n), "main", "design", 9, False)["allowed"])


class LedgerWrites(unittest.TestCase):
    def _apply(self, current, target, kind, uncertainty="settled"):
        state = {"scopes": {}, "total_hops": 0}
        if current:
            state["scopes"]["s"] = scope(current)
        v = {"target": target, "kind": kind}
        route.apply_move(CFG, state, "s", v, uncertainty, 9, False, "")
        return state

    def test_hop_installs_the_reverse_ban(self):
        st = self._apply("cheap", "mid", "hop")
        self.assertIn(["mid", "cheap"], st["scopes"]["s"]["bans"])

    def test_assign_installs_no_ban(self):
        st = self._apply(None, "cheap", "assign")
        self.assertEqual(st["scopes"]["s"]["bans"], [])

    def test_return_to_main_installs_no_ban(self):
        """Otherwise main could never delegate this scope again."""
        st = self._apply("cheap", "main", "return")
        self.assertEqual(st["scopes"]["s"]["bans"], [])

    def test_assign_does_not_spend_task_budget(self):
        self.assertEqual(self._apply(None, "cheap", "assign")["total_hops"], 0)

    def test_hop_spends_task_budget(self):
        self.assertEqual(self._apply("cheap", "mid", "hop")["total_hops"], 1)


class Density(unittest.TestCase):
    def test_config_default_applies(self):
        self.assertEqual(route.active_density(CFG, {}), CFG["response"]["density"])

    def test_session_override_wins(self):
        self.assertEqual(route.active_density(CFG, {"density": "terse"}), "terse")

    def test_garbage_falls_back(self):
        self.assertEqual(route.active_density(CFG, {"density": "sideways"}), "default")

    def test_every_level_renders(self):
        for level in route.DENSITY:
            out = "\n".join(route.render_density(CFG, {"density": level}))
            self.assertIn(level, out)

    def test_load_bearing_rules_survive_card_edits(self):
        """The card gets rewritten for token efficiency. This pins the semantics the
        evals actually exercised, so a rewrite cannot quietly drop one."""
        must = ["compress depth, never breadth",  # coverage is invariant
                "unverified claims",              # protected content
                "lede",                          # answer-first, as a leading word
                "ceremony",                       # the short-answer guard
                "scanning time"]                  # the goal is reading, not tokens
        for level in ("terse", "default"):
            out = "\n".join(route.render_density(CFG, {"density": level})).lower()
            for rule in must:
                self.assertIn(rule, out, f"card at density={level} lost: {rule}")

    def test_card_stays_within_its_token_budget(self):
        """It rides on every prompt. An efficiency skill that bloats the context it
        lives in has spent its own savings."""
        card = "\n".join(route.render_density(CFG, {"density": "default"}))
        self.assertLess(len(card), 1200, "density card is growing; re-earn every line")


class CardIsUnbreakable(unittest.TestCase):
    """The card runs on every prompt. It must never fail the user's turn."""

    def _card(self, stdin):
        return subprocess.run([sys.executable, str(SKILL / "scripts" / "route.py"), "card"],
                              input=stdin, capture_output=True, text=True, timeout=30)

    def test_garbage_stdin_exits_clean(self):
        r = self._card("this is not json {{{")
        self.assertEqual(r.returncode, 0)

    def test_empty_stdin_exits_clean(self):
        self.assertEqual(self._card("")     .returncode, 0)

    def test_valid_payload_produces_a_card(self):
        r = self._card(json.dumps({"session_id": "t", "cwd": str(SKILL.parent.parent.parent)}))
        self.assertEqual(r.returncode, 0)
        self.assertIn("[lean]", r.stdout)


class ConfigIsCoherent(unittest.TestCase):
    def test_every_tier_has_a_model_for_the_active_transport(self):
        for tier in CFG["order"]:
            self.assertIn(CFG["transport"], CFG["tiers"][tier]["models"],
                          f"tier {tier} has no model id for transport {CFG['transport']}")

    def test_order_is_cheapest_first(self):
        self.assertEqual(CFG["order"][-1], "main", "main must be the top of the ladder")

    def test_order_matches_tiers(self):
        self.assertEqual(set(CFG["order"]), set(CFG["tiers"]))

    def test_density_default_is_a_real_level(self):
        self.assertIn(CFG["response"]["density"], route.DENSITY)


if __name__ == "__main__":
    unittest.main(verbosity=2)
