## Agent skills

### Issue tracker

Issues and specs for this repo live in GitHub Issues via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: read root `CONTEXT.md` and `docs/adr/` when present. See `docs/agents/domain.md`.

### Skill sources and decisions

Every Skill keeps a decision record in `skills/<name>/SOURCES.md`. The name undersells it: the file records why the Skill exists and why each rule in it is there, not only where the evidence came from. `skills/readme-writing/SOURCES.md` shows the format.

- Write or update it in the same PR that creates a Skill or changes what one says.
- Origin: the request or use case that prompted the Skill, quoted in the requester's words, and the failure it is meant to prevent.
- Source register: each source with its link or location, the date it was read, what it shows, and where it stops applying to this Skill.
- One entry per decision: Status (Adopted, Rejected or Proposed, with the date), Rule (the `SKILL.md` section and wording), Source, Evidence (counts and quotes from the sources), Transfer (why it applies here), Eval (the case ids that exercise it) and Revisit if (the result that would reopen it).
- Keep rejected ideas: change an entry's status instead of deleting it, so the next review doesn't propose it again without new evidence. Record what reviews caught, and list rules that have no recorded source as such.
- Ground entries in sources you actually read, not memory: fetch them, count how many show a pattern, and say when a pattern rests on one source.
- Read the record before changing a Skill, and argue with the specific entry. It is for maintainers: `SKILL.md` does not link to it, and nothing the Skill needs at run time goes only there.
- A Skill that has no record yet gets one the next time it changes, with entries for the rules that change touches.
