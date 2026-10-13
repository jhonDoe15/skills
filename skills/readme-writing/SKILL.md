---
name: readme-writing
description: Use when the user asks to write, rewrite, restructure, or review a project's README, the front page a stranger reads first.
---

# README Writing

A README is the page a stranger reads to decide whether a project is for them, and then to start
using it. This Skill owns the README's substance: what goes in it, in what order, and whether each
claim is true. It is grounded in how widely used open source projects structure their READMEs; see
[REASONING.md](REASONING.md) for the analysis and sources behind each rule.

## Routing

Select `readme-writing` when the deliverable is a project README: creating one, rewriting or
restructuring one, or reviewing one.

Select another outcome for:

- agent-facing guidance (`AGENTS.md`, `CLAUDE.md`): `agents-file-writer`;
- reference documentation pages, changelogs, and release notes: they are not the front page;
- the README's sentence-level expression for a human reader: `to-humans`, selected independently
  alongside this Skill. This Skill does not invoke it.

A review request is read-only: run steps 1 to 3 and 5, and report findings instead of writing.

## 1. Establish the project's purpose

Before drafting, write down in one sentence what the project is for and what makes it different,
in the maintainers' own terms. Take it from their stated goals, design or philosophy docs, and the
code's behavior, not from the current README. If the maintainers' purpose and the current README
disagree, the purpose wins and the disagreement is a finding.

List the facts a reader needs to adopt it: what it supports, what it requires, how to install and
run it, its maturity, and its license.

Complete when the purpose sentence and the fact list exist, each fact traced to a source file.

## 2. Ground the structure in reference READMEs

Read the READMEs of five or more widely used projects in the same category (for a linter: linters
and formatters; for a library: comparable libraries). Fetch the raw files and read them; do not
rely on memory. Note how each opens, what proves its claim, what it leaves to its docs, and how an
opinionated project states its stance.

[REASONING.md](REASONING.md) records patterns that held across 15 developer tools. Use them as the
default and change one only when the category's references disagree. Record which references you
read.

Complete when the reference list and the patterns you are applying are written down.

## 3. Choose content and order

Default order, top first:

1. **Name and identity line.** One sentence naming a category the reader already knows plus what
   sets this project apart. The purpose leads, not a feature. A short row of links to the main
   docs may follow it.
2. **The problem and the stance.** One short paragraph a stranger can follow. An opinionated
   project states its bargain here: what the user gives up and what they get.
3. **Proof.** A concrete example right under the pitch: an input and its output, a benchmark, or a
   real error message. Capture output from a real run of the current code; never invent or edit it
   beyond trimming whole lines. Show any file path or setup the example depends on.
4. **Highlights.** Three to six one-line claims, each one a reason to choose the project. Cut any
   that restate the intro or the example.
5. **Getting started.** Requirements, then one to three commands. When there are variants
   (languages, platforms, presets), one compact table. Then the first integration step a user
   needs (CI, editor, agent).
6. **Stance FAQ.** For an opinionated project, answer "I disagree with rule X" in the project's
   own terms.
7. **Documentation links**, each with a few words on what it covers.
8. **Status** when the project is pre-1.0 or experimental: what may change, and what to pin.
9. **Contributing, License, Acknowledgements**, with credits last.

Move to the docs and link instead: command-line flags, exit codes, configuration keys, tool
versions, internal paths, architecture, history, issue or PR numbers, and anything only one
variant's users need.

Complete when every fact from step 1 has a place in the README or a linked doc, and every README
section serves the stranger's decide-then-start path.

## 4. Write

Write the README in that order. Keep each claim true for every variant it covers: if it holds for
some languages or platforms only, scope it in the sentence or move it to the variant's doc. Prefer
the project's own vocabulary over generic marketing words.

When other files repeat the README (package description, keywords, docs that say they mirror it),
update them in the same change.

## 5. Verify

1. Check every claim against the code and docs, including each variant in tables and lists.
2. Run every command shown, or state which ones could not run and why.
3. Confirm the example output matches a real run, including line numbers against the code shown.
4. Resolve every link and anchor.
5. Get two independent adversarial reviews, one for factual accuracy against the code and one for
   structure as a stranger reading against the reference READMEs, then fix what they find.

Complete when no unverified claim remains, or each one is reported as unverified.

## Completion

Complete when:

- the purpose sentence leads the README;
- the structure follows the recorded reference patterns, or each departure has a reason;
- the example comes from a real run;
- every claim, command, and link was verified or reported as unverified;
- both adversarial reviews ran and their findings were fixed or answered;
- the result reports the references read, the changes made, and anything left unverified.
