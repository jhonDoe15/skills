---
name: readme-writing
description: Use when the user asks to write, rewrite, restructure, review, or correct a project's README.
---

# README Writing

A README is the page a stranger reads to decide whether a project is for them, and then to start
using it. This Skill owns the README's substance: what goes in it, in what order, and whether each
claim is true. The `to-humans` Audience outcome owns how its sentences read; the managing agent
selects it independently, and this Skill does not invoke it.

## Routing

Select `readme-writing` when the deliverable is a project README (`README.md` or its equivalent at
the root of a repository, package, or workspace member). Direct invocation of `readme-writing`
wins for its README deliverable.

Select another outcome for:

- agent-facing guidance (`AGENTS.md`, `CLAUDE.md`): `agents-file-writer`;
- reference documentation pages, changelogs, release notes, and contributor guides. No suite
  outcome owns these; handle them as ordinary requested work.

Before choosing a branch, name the target file. When more than one README could be meant (a
monorepo package, a profile or organization README), ask which one.

## Choose the branch

- **Create or restructure:** the user asks for a new README, a rewrite, or a new structure. Run
  steps 1 to 5.
- **Targeted correction:** the user asks to change named content (fix the install command, add a
  section, update a claim) without asking for a new structure. Edit only that content, then run
  step 5 for the claims you changed.
- **Review:** the user asks to assess the README, or says not to change it. Run steps 1 to 3 and
  step 5 checks 1 to 4 without changing any file, then return findings ranked by impact on a
  stranger, each quoting the README location and citing the source file, run, or reference that
  shows the problem.

## 1. Establish the project's purpose

Write down in one sentence what the project is for and what makes it different, in the
maintainers' own terms. Take it from their stated goals, design or philosophy docs, and the code's
behavior, not from the current README.

List the facts a reader needs to adopt it: what it supports, what it requires, how to install and
run or use it, its maturity, and its license. Trace each fact to a source file.

If no maintainer statement of purpose exists, propose one from the code and docs, mark it as
proposed, and ask the user to confirm it before writing. If the maintainers' stated purpose and the
current README disagree, report both and ask which governs.

Complete when the purpose sentence is confirmed or sourced and every fact has a source.

## 2. Read reference READMEs

Read the READMEs of five or more widely used projects of the same kind (for a linter, other
linters and formatters; for a library, comparable libraries; for an application, comparable
applications). Fetch the raw files; do not rely on memory. Fewer than five is fine when the kind
has fewer well-known projects; say so. For each, note how it opens, what proves its claim, what it
leaves to its docs, and how it handles anything the project has in common with it (variants,
maturity, a strong stance).

Where the references agree with a default in step 3, keep the default. Where most of them depart
from it in the same way, follow them and record why.

Complete when the references read and any departures from step 3's defaults are written down.

## 3. Choose content and order

Default order, top first. Items marked "when" apply only when their condition holds.

1. **Name and identity line.** One sentence naming a category the reader already knows plus what
   sets this project apart. The purpose leads, not a feature.
2. **The problem.** One short paragraph a stranger can follow. When the purpose sentence names
   something the user gives up or must accept (strict rules, fixed formatting, fewer options),
   state that trade here, with what the user gets for it.
3. **Proof.** One concrete demonstration right under the pitch, taken from a real run of the
   current code: a command and its output for a tool, a short usage snippet and its result for a
   library, a screenshot for an application, or a benchmark. Never invent or edit output beyond
   trimming whole lines. Show any file path or setup the example depends on.
4. **Highlights.** A short list of one-line reasons to choose the project. Each must add something
   the identity line and the proof do not already show.
5. **Getting started.** Requirements, then the fewest commands that get a first result. When there
   are variants (languages, platforms, frameworks, modes), one compact table. Then the first
   integration step most users need (for example CI, an editor, or a framework plugin).
6. **Objections**, when the project enforces choices users may resist: answer "what if I disagree
   with X?" in the project's own terms.
7. **Documentation links**, each with a few words on what it covers.
8. **Status**, when the version is below 1.0 or the project calls itself experimental: what may
   change, and what to pin.
9. **Contributing, License, Acknowledgements.**

Keep what the existing README carries for its community (badges, translation links, sponsor and
contributor sections, a code of conduct link) unless the user asks to remove it.

Move to the docs and link instead: command-line flag lists, exit codes, configuration keys,
versions of bundled third-party tools, internal paths, architecture, project history, issue or
pull request numbers, and anything only one variant's users need. Keep one of these in the README
only when most readers need it to get a first result, and say why.

Complete when every fact from step 1 has a place in the README or a linked doc, and every README
section serves the stranger's decide-then-start path.

## 4. Write

Write the README in that order. Keep each claim true for every variant it covers: when it holds for
some variants only, scope it in the sentence or move it to the variant's doc.

When another file repeats README text (a package description, keywords, a doc that says it mirrors
the README), list those files and update them in the same change. Create a linked doc only when the
user asked for the README work and the moved material has no existing home; name the new path.

Complete when the README and the listed files are written.

## 5. Verify

1. Check every claim against the code and docs, row by row for tables and lists of variants.
2. Run the commands the README tells a reader to run, in a scratch checkout or sandbox. Do not run
   remote install scripts or commands that change the user's machine or accounts without
   authorization; report those as unverified.
3. Confirm the proof matches a real run, including line numbers against the code shown.
4. Resolve every link and anchor.
5. Get two independent adversarial reviews of the draft, one for factual accuracy against the code
   and one for structure as a stranger reading it against the references, then fix what they find.
   When the host cannot start an independent reviewer, do both reviews yourself in sequence, and
   report them as not independent.

Complete when no unverified claim remains, or each one is reported as unverified.

## Failure behavior

- References cannot be fetched: use step 3's defaults, report "references not read", and do not
  claim the structure is grounded in them.
- A command, link, or proof cannot be run or resolved: keep or drop the claim as the evidence
  allows, and report it as unverified.
- The purpose or a governing conflict stays unresolved: stop before writing and return the
  proposed purpose or the conflicting sources, with the smallest decision needed.

## Completion

Create or restructure is complete when:

- the purpose sentence leads the README;
- the order follows step 3, or each departure has a recorded reason;
- the proof comes from a real run;
- every claim, command, and link was verified or reported as unverified;
- the reviews ran, or the gap is reported;
- the result lists the references read, the changes made, the files updated with it, and anything
  left unverified.

A targeted correction is complete when the changed content is written and its claims are verified
or reported as unverified. A review is complete when the ranked findings are returned and no file
changed.
