# Sources and decisions

This file records why `to-humans` says what it says. It is for maintainers and
is not part of the skill's execution path.

Use it before changing the skill. When new evidence arrives, find the decision
it touches. You can then tell whether the idea is new, was considered and
rejected, or is already implemented, and argue with that specific entry.

## Adding an entry

Give each decision an ID, a status, and these fields. Leave a field out only
when it does not apply.

- **Status:** Adopted, Rejected, or Proposed, with the date.
- **Rule:** the `SKILL.md` section and the wording it produced.
- **Source:** IDs from the source register below.
- **Evidence:** the specific finding, with numbers where the source gives them.
- **Transfer:** why the evidence applies to this skill, and where it stops
  applying.
- **Eval:** the case IDs that exercise the rule.
- **Revisit if:** the result that would reopen the decision.

Change an entry's status instead of deleting it. A rejected idea is the record
that stops the next review from proposing it again without new evidence.

## Source register

### S1. StoryScope

Russell, Rajendhran, Pham, Iyyer, and Wieting. *StoryScope: Investigating
idiosyncrasies in AI fiction.* arXiv 2604.03136, v6, August 2026.
<https://arxiv.org/abs/2604.03136>. Code and data:
<https://github.com/jenna-russell/storyscope>. Read 2026-10-13.

What it measured: 10,272 writing prompts, each written by a human author and by
Claude Sonnet 4.6, GPT-5.4, Gemini 3 Flash, DeepSeek V3.2, and Kimi K2.5. The
stories average about 5,000 words. An LLM pipeline scored 304 narrative
features per story. Narrative features alone separate human from AI stories at
93.2% macro-F1.

Limits for this skill:

- It studies fiction. Every use here is an analogy to expository prose.
- It measures what makes text detectable as AI, not what readers prefer.
- Human stories come from published, edited anthologies. AI stories are single
  generations from a short prompt.
- Percentages below compare AI and human stories in that corpus. They are
  tendencies, not rules about any single text.

## Decisions

### D1. End when the content ends

- **Status:** Adopted, 2026-10-13.
- **Rule:** *Write for the reader*. No restated conclusion, stated lesson, or
  generic sign-off. A one-line offer of specific unrequested material stays
  allowed.
- **Source:** S1, sections 4.1 and 5.
- **Evidence:** AI narrators state the story's theme in 77% of stories, humans
  in 52%. The paper's Claude fingerprint includes favoring epilogues and quiet
  endings.
- **Transfer:** The reply-level form of this habit is the closing recap, the
  "key takeaway" paragraph, and the "let me know if" sign-off. The skill most
  often runs on Claude, which has the epilogue tendency. The specific follow-up
  offer exception keeps this consistent with the existing rule to leave
  unrequested secondary material for a follow-up.
- **Eval:** `role/no-restated-ending`, `role/what-happened-recap`,
  `role/short-complete-answer`.
- **Revisit if:** blind comparisons show readers prefer a closing summary for
  some length or type of reply.

### D2. Prefer named specifics over categories

- **Status:** Adopted, 2026-10-13.
- **Rule:** *Write for the reader*. Use the actual file, version, number,
  person, team, system, or source when the context supplies it. Never invent
  one.
- **Source:** S1, section 4.1.
- **Evidence:** AI references to other works are vague allusions 72% of the
  time, human references 50%. Humans name specific texts and authors in 47% of
  stories, AI in 24%.
- **Transfer:** In work prose the same habit produces "some services" where
  the reader needs `auth-gateway`. The never-invent clause keeps the rule
  inside the `writing-foundation` grounding guarantee.
- **Eval:** `role/named-specifics`, `role/human-status`.
- **Revisit if:** outputs start padding replies with names that do not help
  the reader act.

### D3. Name the thing directly

- **Status:** Adopted, 2026-10-13. Sharpens the existing plain-wording rule.
- **Rule:** *Write for the reader*. Use a metaphor only when it explains
  something the literal statement cannot.
- **Source:** S1, section 4.1.
- **Evidence:** AI conveys emotion through bodily sensation and metaphor in
  81% of stories, humans in 38%. Humans name the emotion directly in 29% of
  stories, AI in 8%.
- **Transfer:** The expository equivalent is figurative padding around a
  plain fact. The analogy is looser than D1 and D2, so the rule leaves room
  for a metaphor that does explanatory work.
- **Eval:** `role/no-restated-ending` (literal cause expectation).
- **Revisit if:** judges flag literal explanations as harder to follow for
  non-specialist readers.

### D4. Direct address as a review prompt

- **Status:** Adopted as a review prompt, not a rule, 2026-10-13.
- **Rule:** *Keep contextual voice*. Added to the review-prompt list.
- **Source:** S1, section 4.1.
- **Evidence:** Humans address the reader directly in 28% of stories, AI in
  7%.
- **Transfer:** Weaker than D1 to D3. Addressing the reader suits replies and
  instructions but not neutral records, so it stays a judgment call.
- **Eval:** none yet.
- **Revisit if:** a review finds passive, reader-less phrasing is a recurring
  complaint.

### D5. No em dash

- **Status:** Adopted before this record existed. Reaffirmed 2026-10-13 with a
  known limit.
- **Rule:** *Keep contextual voice*.
- **Source:** Original source not recorded. S1 adds context.
- **Evidence:** S1 describes surface signals such as em dashes as increasingly
  fleeting and notes model updates have already reduced them. Rewriting AI
  stories to remove surface artifacts lowered narrative-feature detection by
  only 1.6 points.
- **Transfer:** The rule is cheap hygiene. The patterns in D1 to D3 likely
  matter more to whether prose reads as generic.
- **Eval:** mechanical `forbidden_patterns` in every role and outcome case.
- **Revisit if:** default model output stops producing em dashes, making the
  rule dead weight.

### R1. Fiction structure features

- **Status:** Rejected for this skill, 2026-10-13.
- **Source:** S1, sections 4.1 and 5.
- **Evidence:** Subplot counts, character agency, dialogue used as
  philosophical debate, and setting that mirrors a character's mood.
- **Transfer:** None. These describe fiction and have no counterpart in
  replies or updates. They are a strong starting list for a future fiction
  writing skill.

### R2. Human-likeness as the goal

- **Status:** Rejected, 2026-10-13.
- **Source:** S1.
- **Evidence:** S1 measures detectability. Some human traits it found, such
  as delayed revelation, would make work prose harder to read.
- **Transfer:** The skill optimizes reader effort. A finding from S1 is
  adopted only when the human trait also lowers reader effort. Answer-first
  ordering is the clearest case where the skill deliberately differs from
  natural human writing.

### D6. Structure for "what happened" explanations

- **Status:** Adopted, 2026-10-13.
- **Rule:** *Match the purpose*, the five-step list for an account of what
  happened. A requested timeline or neutral record keeps chronological order.
- **Source:** S1, sections 4.1 and 5. Not yet consulted, but worth checking
  on the next review: the inverted pyramid from news writing, and Minto's
  Situation, Complication, Resolution.
- **Evidence, by step:**
  1. Outcome first. AI tells stories in strict order, from first clue to the
     reveal. Humans open at the point that matters and go back.
  2. Late discovery first. Humans use revelations that force a re-reading of
     earlier scenes. In a recap, stating the root cause up front gives the
     reader that re-reading without the wait.
  3. Side threads only when they connect. Humans integrate subplots into the
     main theme in 42% of stories, AI in 21%.
  4. Weight by importance. The paper's Claude fingerprint is flat event
     escalation, with every event given similar weight.
  5. Credit what actually resolved it. Resolution is driven by the
     protagonist's choices in 69% of AI stories and 46% of human ones.
- **Transfer:** A recap is a small story, so this is the closest analogy in
  S1. Steps 1 and 2 also follow from the existing answer-first rule. Step 3
  gives the existing "unrequested secondary detail" rule a concrete test for
  narratives. The record still describes how AI and human stories differ, not
  what readers prefer.
- **Eval:** `role/what-happened-recap`. Its notes arrive in chronological
  order, the root cause is found last, one side thread is irrelevant, and a
  rollback rather than the team's fix restored service.
- **Revisit if:** readers of real recaps ask for chronological order, or the
  rule starts reordering requested timelines.

## Rules without a recorded source

These rules predate this file. Add a source or a decision entry when one is
known.

- Answer first, then supporting detail.
- Shortest complete explanation, and unrequested detail left for follow-up.
- Decision support: recommendation, basis, material uncertainty, change
  condition.
- Neutral record without invented opinion.
- Contextual voice over standardized prose.
- Non-prose work products stay unchanged.
