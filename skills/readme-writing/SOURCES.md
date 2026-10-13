# Sources and decisions

This file records why `readme-writing` says what it says, and where each rule came from. It is
for maintainers and is not part of the Skill's execution path: the decisions it supports are stated
in `SKILL.md`.

Use it before changing the Skill. When new evidence arrives, find the decision it touches. You can
then tell whether the idea is new, was considered and rejected, or is already implemented, and argue
with that specific entry.

## Adding an entry

Give each decision an ID, a status, and these fields. Leave a field out only when it does not
apply.

- **Status:** Adopted, Rejected, or Proposed, with the date.
- **Rule:** the `SKILL.md` section and the wording it produced.
- **Source:** IDs from the source register below.
- **Evidence:** the specific finding, with counts where the source gives them.
- **Transfer:** why the evidence applies to this Skill, and where it stops applying.
- **Eval:** the case IDs that exercise the rule.
- **Revisit if:** the result that would reopen the decision.

Change an entry's status instead of deleting it. A rejected idea is the record that stops the next
review from proposing it again without new evidence.

## Source register

### S1. The maintainer's request

The Skill comes from restructuring the README of nitpicker, a code-quality gate for code written by
coding agents (October 2026). The maintainer's request, quoted from that conversation, found the
first rewrite "much better" but "a bit unstructured and too specific at times", reading "too much
like a generic markdown document", and asked to "look again at popular open source projects, at
their READMEs, and how they structure it, how they word different things", then replicate that
with the project's own purpose and perspective. The analysis in S2 to S4 is the result, and the
maintainer asked for it to become this Skill.

### S2. Fifteen reference READMEs

The default-branch READMEs of 15 developer tools, fetched raw on 2026-10-13:

| Project                   | README                                                                       |
| ------------------------- | ---------------------------------------------------------------------------- |
| Ruff                      | https://github.com/astral-sh/ruff/blob/main/README.md                        |
| uv                        | https://github.com/astral-sh/uv/blob/main/README.md                          |
| ty                        | https://github.com/astral-sh/ty/blob/main/README.md                          |
| Black                     | https://github.com/psf/black/blob/main/README.md                             |
| Prettier                  | https://github.com/prettier/prettier/blob/main/README.md                     |
| JavaScript Standard Style | https://github.com/standard/standard/blob/master/README.md                   |
| ESLint                    | https://github.com/eslint/eslint/blob/main/README.md                         |
| Biome                     | https://github.com/biomejs/biome/blob/main/packages/@biomejs/biome/README.md |
| Oxc                       | https://github.com/oxc-project/oxc/blob/main/README.md                       |
| Knip                      | https://github.com/webpro-nl/knip/blob/main/packages/knip/README.md          |
| golangci-lint             | https://github.com/golangci/golangci-lint/blob/main/README.md                |
| Vite                      | https://github.com/vitejs/vite/blob/main/README.md                           |
| Deno                      | https://github.com/denoland/deno/blob/main/README.md                         |
| Danger JS                 | https://github.com/danger/danger-js/blob/main/README.md                      |
| typescript-eslint         | https://github.com/typescript-eslint/typescript-eslint/blob/main/README.md   |

Limit: all 15 are developer tools, mostly linters, formatters and JavaScript or Python tooling.
Counts below are "N of 15" in this set, not rules about READMEs in general. Forms the set does not
contain, such as a usage snippet for a library or a screenshot for an application, come from
general practice, not from S2.

### S3. The nitpicker README under review

The README the maintainer asked to restructure, and its first rewrite. Its failure modes:

- **The identity line was a feature, not the purpose.** It said the tool "fails a change only for
  the problems that change introduces". The purpose ("narrow each language to roughly one allowed
  way of doing each thing") sat in the second paragraph.
- **The proof was stale and incomplete.** The message it showed no longer existed in the code, and
  it showed output without the code that caused it.
- **Too specific.** A list of pinned tool names, a deep project path, exit codes, and an aside
  listing languages in parentheses.
- **Gaps.** Three supported languages and the bundled agent skill were never mentioned, and there
  was no answer to "what if I disagree with a rule", which the project's design doc mostly exists to
  answer.

### S4. Adversarial reviews

Two adversarial reviews ran on the first nitpicker rewrite, and two more on the first draft of this
Skill. Their findings:

- **Claims true for some variants only.** "Exceptions go in the config file" was false for one
  language preset; "the analyzers ship inside the package" held for two of five; a requirements
  column omitted tools some presets need.
- **Hidden dependencies of the example.** The example's output depended on a project layout and a
  test the reader could not see.
- **Repetition.** Highlights restated the intro, the example and later sections.
- **Mirrored files.** A docs page said it matched the README statement by statement, and the
  package description repeated the old tagline.
- **This Skill's first draft** overstated several S2 patterns (a docs link row it attributed to
  three projects, a fixed three-to-six highlight count, single-source patterns presented as
  general), had no review or small-edit branch, no failure behavior, and asked agents to run every
  command a README shows. The counts, conditions, branches and command safety rule in `SKILL.md`
  come from that review.

### S5. `agents-file-writer`

The `agents-file-writer` Skill in this suite separates README content (for people deciding about
and using a project) from agent-facing guidance. This Skill takes the README side of that line.

## Decisions

### D1. The identity line comes first and carries the purpose

- **Status:** Adopted, 2026-10-13.
- **Rule:** *1. Establish the project's purpose* and *3. Choose content and order*, item 1: "One
  sentence naming a category the reader already knows plus what sets this project apart. The
  purpose leads, not a feature." The purpose comes from the maintainers' stated goals, design or
  philosophy docs, and the code, not from the current README.
- **Source:** S2, S3.
- **Evidence:** 14 of 15 references open with an identity line; typescript-eslint's README only
  points to its website. "An extremely fast Python linter and code formatter, written in Rust"
  (Ruff). "The uncompromising Python code formatter" (Black). "An opinionated code formatter"
  (Prettier). Links to the docs sit near it in Ruff (above it, under the badges) and ESLint (a long
  row under the title), and after the pitch in Black and Prettier. In S3 the identity line was a
  feature and the purpose sat in the second paragraph.
- **Transfer:** The pattern holds in 14 of 15 developer tools. Taking the purpose from the
  maintainers rather than the old README is what S3 needed; when no maintainer statement exists,
  step 1 asks the user to confirm a proposed purpose instead of inventing one.
- **Eval:** `role/purpose-led-readme-rewrite`, `role/unstated-purpose-confirmation`,
  `role/read-only-readme-review`, `outcome/complete-verified-readme-outcome`.
- **Revisit if:** references of another kind (libraries, applications) consistently open with
  something other than an identity line.

### D2. State the trade only when the purpose names one

- **Status:** Adopted, 2026-10-13.
- **Rule:** *3. Choose content and order*, item 2: "When the purpose sentence names something the
  user gives up or must accept (strict rules, fixed formatting, fewer options), state that trade
  here, with what the user gets for it."
- **Source:** S2.
- **Evidence:** The trade is stated up front by the strongly opinionated tools, Black and Standard,
  the two whose purpose is removing choices. Black: "By using it, you agree to cede control over
  minutiae of hand-formatting. In return, Black gives you speed, determinism, and freedom from
  pycodestyle nagging about formatting." Standard's first section: "No configuration... No
  decisions to make." Prettier calls itself opinionated but states no trade.
- **Transfer:** Two of 15 is a pattern for projects whose purpose is a constraint, not for every
  project, so the rule is conditional on the purpose naming something the user gives up.
- **Eval:** `role/purpose-led-readme-rewrite` (no configuration file),
  `outcome/complete-verified-readme-outcome` (raw HTML dropped unless enabled).
- **Revisit if:** blind comparisons show readers miss the trade in projects whose purpose does not
  name one.

### D3. Proof right under the pitch, from a real run

- **Status:** Adopted, 2026-10-13.
- **Rule:** *3. Choose content and order*, item 3: "One concrete demonstration right under the
  pitch, taken from a real run of the current code... Never invent or edit output beyond trimming
  whole lines. Show any file path or setup the example depends on." *5. Verify*, check 3: "Confirm
  the proof matches a real run, including line numbers against the code shown."
- **Source:** S2, S3, S4.
- **Evidence:** 4 of 15 put proof right under the pitch. Ruff, uv and ty show a benchmark chart;
  Prettier shows an input and its output. Standard shows a real error line, but in its Usage section
  after installation. Black, ESLint, Vite, Biome and golangci-lint have none. In S3 the proof was
  stale (its message no longer existed in the code) and showed output without the code that caused
  it. In S4 the example's output depended on a project layout and a test the reader could not see.
- **Transfer:** The pattern is a minority one in S2. It is kept as a default because S3 showed what
  its absence costs: a pitch with nothing a stranger can check. The usage snippet for a library and
  the screenshot for an application come from general practice, not from S2.
- **Eval:** `role/purpose-led-readme-rewrite`, `role/read-only-readme-review`,
  `outcome/complete-verified-readme-outcome`.
- **Revisit if:** blind comparisons show a README without proof does as well with strangers, or
  references of another kind consistently put proof elsewhere.

### D4. Highlights are a short list, each adding something

- **Status:** Adopted, 2026-10-13.
- **Rule:** *3. Choose content and order*, item 4: "A short list of one-line reasons to choose the
  project. Each must add something the identity line and the proof do not already show."
- **Source:** S2, S4.
- **Evidence:** Highlights are short, scannable bullets. Ruff (10), uv (11), ty (8), Vite (6) and
  Standard (3) use one line per bullet; Biome uses bold one-sentence paragraphs. Many carry a link
  to the docs. In S4 the first nitpicker rewrite's highlights restated the intro, the example and
  later sections.
- **Transfer:** The counts range from 3 to 11, so the rule sets no count (see R2). The "adds
  something" test comes from S4, not S2.
- **Eval:** `outcome/complete-verified-readme-outcome` (dimension `stranger-ready-readme`), role
  dimension `purpose-first-structure`.
- **Revisit if:** judges find highlight lists that pass the test but still read as padding.

### D5. One compact variants table

- **Status:** Adopted, 2026-10-13.
- **Rule:** *3. Choose content and order*, item 5: "When there are variants (languages, platforms,
  frameworks, modes), one compact table." *1. Establish the project's purpose*: list what the
  project supports, each fact traced to a source file.
- **Source:** S2, S3.
- **Evidence:** Supported languages appear on the first screen: Prettier and Biome list them; Deno
  names its three in the identity line. In S3, three supported languages were never mentioned.
- **Transfer:** S2 shows languages; the rule extends the table to platforms, frameworks and modes
  because they raise the same question for a stranger.
- **Eval:** `role/purpose-led-readme-rewrite` (Python and TypeScript),
  `outcome/complete-verified-readme-outcome` (Node build and browser bundle).
- **Revisit if:** variant tables grow past what a stranger needs to pick one.

### D6. Install is the fewest commands, then a link

- **Status:** Adopted, 2026-10-13.
- **Rule:** *3. Choose content and order*, item 5: "Requirements, then the fewest commands that get
  a first result."
- **Source:** S2.
- **Evidence:** Install is a few commands, then a link. Black, Biome, ty and Standard show one or
  two; uv and Deno show one per platform. Flags, exit codes and configuration live in their docs.
- **Transfer:** The rule names no number because one command per platform, as uv and Deno show, is
  still the fewest.
- **Eval:** `role/targeted-install-correction`, `outcome/complete-verified-readme-outcome`
  (dimension `stranger-ready-readme`).
- **Revisit if:** a kind of project routinely needs a longer setup before a first result.

### D7. Answer objections only when the project enforces choices

- **Status:** Adopted, 2026-10-13.
- **Rule:** *3. Choose content and order*, item 6: "**Objections**, when the project enforces
  choices users may resist: answer 'what if I disagree with X?' in the project's own terms."
- **Source:** S2, S3.
- **Evidence:** "I disagree with rule X" is answered by Standard alone: "No. The whole point of
  `standard` is to save you time by avoiding bikeshedding about code style." In S3 the README had
  no answer to "what if I disagree with a rule", which the project's design doc mostly exists to
  answer.
- **Transfer:** One reference is thin evidence, so the section is conditional. It earned its place
  in the nitpicker case because its maintainers' design doc is largely an answer to that question.
- **Eval:** `role/purpose-led-readme-rewrite` (what to do when a check seems wrong).
- **Revisit if:** more references of the same kind answer the objection elsewhere (a FAQ page) and
  strangers still find it.

### D8. State status only for pre-1.0 or experimental projects

- **Status:** Adopted, 2026-10-13.
- **Rule:** *3. Choose content and order*, item 8: "**Status**, when the version is below 1.0 or the
  project calls itself experimental: what may change, and what to pin."
- **Source:** S2.
- **Evidence:** ty states its status ("ty is currently in beta", with a version policy). ESLint
  documents version support and semantic versioning.
- **Transfer:** ty's statement is the case the rule follows. ESLint's version policy is the kind of
  detail D11 sends to the docs for a stable project, hence the condition.
- **Eval:** `outcome/complete-verified-readme-outcome` (version 0.9.2),
  `role/read-only-readme-review` (version 0.4.0, optional finding).
- **Revisit if:** strangers ask about stability for 1.0 projects often enough to need it up front.

### D9. Credits near the end

- **Status:** Adopted, 2026-10-13.
- **Rule:** *3. Choose content and order*, item 9: "**Contributing, License, Acknowledgements.**"
- **Source:** S2.
- **Evidence:** Ruff's Acknowledgements comes after Contributing and Support, followed only by "Show
  Your Support" and License. Oxc and Knip credit the projects they borrow from in their License
  sections.
- **Transfer:** Credits do not help a stranger decide or start, so they go last.
- **Eval:** none yet.
- **Revisit if:** a project's license or upstream terms require credit nearer the top.

### D10. Keep what the README carries for its community

- **Status:** Adopted, 2026-10-13.
- **Rule:** *3. Choose content and order*: "Keep what the existing README carries for its community
  (badges, translation links, sponsor and contributor sections, a code of conduct link) unless the
  user asks to remove it."
- **Source:** S2.
- **Evidence:** Badges, sponsor lists, testimonials (Ruff), "used by" lists (Ruff, Oxc) and
  translation links (Standard, Biome) appear in S2. They help a project with an audience or
  translations to show.
- **Transfer:** Removing them can cost a project something its maintainers chose to show, so an
  existing README keeps them. Adding them by default is rejected in R1.
- **Eval:** none yet.
- **Revisit if:** maintainers routinely ask to remove these items during a restructure.

### D11. Move specifics to the docs

- **Status:** Adopted, 2026-10-13.
- **Rule:** *3. Choose content and order*: "Move to the docs and link instead: command-line flag
  lists, exit codes, configuration keys, versions of bundled third-party tools, internal paths,
  architecture, project history, issue or pull request numbers, and anything only one variant's
  users need."
- **Source:** S1, S2, S3.
- **Evidence:** S1 found the rewrite "too specific at times". In S3 the README carried a list of
  pinned tool names, a deep project path, exit codes, and an aside listing languages in
  parentheses. In S2, flags, exit codes and configuration live in the docs of the tools whose
  install commands D6 counts. Two references show the drift the list prevents: ESLint's README
  covers version support, semantic versioning, a security policy and its team, and Standard's
  README is about 850 lines, about 500 of them FAQ. Danger JS takes the opposite route: after a
  short pitch it says that "from here on in, this README is going to be for people who are
  interested in working on and improving on Danger JS", and links users to its docs.
- **Transfer:** The list names the specifics S3 carried plus the drift S2 shows. The rule keeps an
  item when most readers need it to get a first result, because some projects cannot start without
  one flag or key.
- **Eval:** `role/purpose-led-readme-rewrite`.
- **Revisit if:** strangers following a restructured README cannot reach a first result without
  opening the docs.

### D12. Keep every claim true for every variant it covers

- **Status:** Adopted, 2026-10-13.
- **Rule:** *4. Write*: "Keep each claim true for every variant it covers: when it holds for some
  variants only, scope it in the sentence or move it to the variant's doc." *5. Verify*, check 1:
  "row by row for tables and lists of variants."
- **Source:** S4.
- **Evidence:** "Exceptions go in the config file" was false for one language preset; "the analyzers
  ship inside the package" held for two of five; a requirements column omitted tools some presets
  need.
- **Transfer:** Any project with variants (D5) can make a sentence true for the main variant only.
  The row-by-row check is how the reviews found these.
- **Eval:** `role/purpose-led-readme-rewrite`, `role/read-only-readme-review`,
  `outcome/complete-verified-readme-outcome`.
- **Revisit if:** reviews in later runs stop finding variant-scoped errors.

### D13. Update mirrored files in the same change

- **Status:** Adopted, 2026-10-13.
- **Rule:** *4. Write*: "When another file repeats README text (a package description, keywords, a
  doc that says it mirrors the README), list those files and update them in the same change."
- **Source:** S4.
- **Evidence:** A docs page said it matched the README statement by statement, and the package
  description repeated the old tagline.
- **Transfer:** A package description or a mirroring doc can exist in any project, so the rule is
  unconditional. S4 is its only evidence.
- **Eval:** role dimension `specifics-moved-to-docs` only; no fixture has a mirrored file yet.
- **Revisit if:** a fixture with a mirrored file shows agents miss it despite the rule.

### D14. Two independent adversarial reviews

- **Status:** Adopted, 2026-10-13.
- **Rule:** *5. Verify*, check 5: "Get two independent adversarial reviews of the draft, one for
  factual accuracy against the code and one for structure as a stranger reading it against the
  references, then fix what they find."
- **Source:** S4.
- **Evidence:** Two adversarial reviews ran on the first nitpicker rewrite, and two more on the
  first draft of this Skill. Their findings, listed in S4, shaped steps 4 and 5 and the branches.
- **Transfer:** Every finding in S4 came from a review, not from the author. When the host cannot
  start an independent reviewer, the rule asks for both reviews in sequence, reported as not
  independent.
- **Eval:** `outcome/complete-verified-readme-outcome`.
- **Revisit if:** reviews in later runs stop finding issues the verify checks did not already
  catch.

### D15. Read five or more references of the same kind

- **Status:** Adopted, 2026-10-13.
- **Rule:** *2. Read reference READMEs*: "Read the READMEs of five or more widely used projects of
  the same kind... Fetch the raw files; do not rely on memory." Where most references depart from a
  step 3 default in the same way, follow them and record why.
- **Source:** S1, S2.
- **Evidence:** S1 asked to "look again at popular open source projects, at their READMEs". All 15
  references in S2 are developer tools, mostly linters, formatters and JavaScript or Python tooling.
- **Transfer:** The step 3 defaults hold for S2's kind of project. Asking for references of the
  same kind lets another kind correct them. Fewer than five is allowed when the kind has fewer
  well-known projects, and *Failure behavior* covers references that cannot be fetched.
- **Eval:** `role/purpose-led-readme-rewrite`, `outcome/complete-verified-readme-outcome`.
- **Revisit if:** references of a new kind repeatedly overturn the same default; change the default
  instead.

### D16. Correction and review branches, failure behavior, and command safety

- **Status:** Adopted, 2026-10-13.
- **Rule:** *Choose the branch* (targeted correction: "Edit only that content"; review: "without
  changing any file", findings ranked by impact on a stranger), *Failure behavior*, and *5. Verify*,
  check 2: "Do not run remote install scripts or commands that change the user's machine or
  accounts without authorization; report those as unverified."
- **Source:** S4.
- **Evidence:** The review of this Skill's first draft found it had no review or small-edit branch,
  no failure behavior, and asked agents to run every command a README shows.
- **Transfer:** A request to fix one claim or to assess a README does not need the full create
  path, and running a README's install command can change the user's machine.
- **Eval:** `role/targeted-install-correction`, `role/read-only-readme-review`,
  `trigger/readme-writing-correct`, `trigger/readme-writing-review`.
- **Revisit if:** corrections in later runs change content outside the named claim, or reviews
  modify files.

### D17. Agent guidance stays with `agents-file-writer`

- **Status:** Adopted, 2026-10-13.
- **Rule:** *Routing*: "agent-facing guidance (`AGENTS.md`, `CLAUDE.md`): `agents-file-writer`".
- **Source:** S5.
- **Evidence:** `agents-file-writer` separates README content, for people deciding about and using
  a project, from agent-facing guidance.
- **Transfer:** This Skill takes the README side of that line and leaves the other side to its
  owner.
- **Eval:** `trigger/readme-writing-agents-file-exclusion`,
  `trigger/readme-writing-agent-guidance-hard-negative`.
- **Revisit if:** `agents-file-writer` changes where it draws the line.

## Rejected

### R1. Badges, sponsors, testimonials, "used by" lists and translations as defaults

- **Status:** Rejected as defaults, 2026-10-13. Kept when present (D10).
- **Source:** S2.
- **Evidence:** Seen but not made defaults: badges, sponsor lists, testimonials (Ruff), "used by"
  lists (Ruff, Oxc) and translation links (Standard, Biome).
- **Transfer:** They help a project with an audience or translations to show. `SKILL.md` keeps them
  when a README already has them and does not add them by default.
- **Revisit if:** blind comparisons show they help strangers decide about a project that lacks
  them.

### R2. A fixed highlight count

- **Status:** Rejected, 2026-10-13.
- **Source:** S2, S4.
- **Evidence:** The first draft of this Skill asked for three to six highlights, which S4 found
  overstated. S2's counts are 10, 11, 8, 6 and 3.
- **Transfer:** No count fits the range S2 shows; the "adds something" test in D4 limits the list
  instead.
- **Revisit if:** highlight lists grow long while each bullet still passes D4's test.

### R3. A docs link row as a pattern

- **Status:** Rejected as a default, 2026-10-13.
- **Source:** S2, S4.
- **Evidence:** The first draft attributed a docs link row to three projects, which S4 found
  overstated. In S2, docs links sit near the identity line in Ruff (above it, under the badges) and
  ESLint (a long row under the title), and after the pitch in Black and Prettier.
- **Transfer:** Placement varies, so `SKILL.md` asks for documentation links with a few words each
  (item 7) and does not prescribe a row under the title.
- **Revisit if:** most references of a kind put a link row under the identity line.

## Rules without a recorded source

These rules are in `SKILL.md` without an entry above. Add a source or a decision entry when one is
known.

- Name the target file, and ask which one when more than one README could be meant.
- `to-humans` owns how the README's sentences read and is selected independently.
- Documentation links, each with a few words on what it covers (item 7).
- Create a linked doc only when the moved material has no existing home, and name the new path.
- Resolve every link and anchor (verify check 4).
