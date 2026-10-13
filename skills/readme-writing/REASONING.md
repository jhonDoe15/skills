# Reasoning

This file records why `readme-writing` says what it says, and where each rule came from. It is
for maintainers. It is not part of the Skill's execution path.

## Origin

The Skill comes from restructuring the README of nitpicker, a code-quality gate for code written by
coding agents (October 2026). Its maintainer found the first rewrite "much better" but still
"unstructured and too specific at times", reading "like a generic markdown document", and asked to
"look at popular open source projects, at their READMEs, how they structure it, how they word
different things", then replicate that with the project's own purpose. The analysis below is the
result, and the maintainer asked for it to become this Skill.

## References read

The main branch READMEs of 15 developer tools, fetched raw on 2026-10-13:

| Project | README |
| --- | --- |
| Ruff | https://github.com/astral-sh/ruff/blob/main/README.md |
| uv | https://github.com/astral-sh/uv/blob/main/README.md |
| ty | https://github.com/astral-sh/ty/blob/main/README.md |
| Black | https://github.com/psf/black/blob/main/README.md |
| Prettier | https://github.com/prettier/prettier/blob/main/README.md |
| JavaScript Standard Style | https://github.com/standard/standard/blob/master/README.md |
| ESLint | https://github.com/eslint/eslint/blob/main/README.md |
| Biome | https://github.com/biomejs/biome/blob/main/packages/@biomejs/biome/README.md |
| Oxc | https://github.com/oxc-project/oxc/blob/main/README.md |
| Knip | https://github.com/webpro-nl/knip/blob/main/packages/knip/README.md |
| golangci-lint | https://github.com/golangci/golangci-lint/blob/main/README.md |
| Vite | https://github.com/vitejs/vite/blob/main/README.md |
| Deno | https://github.com/denoland/deno/blob/main/README.md |
| Danger JS | https://github.com/danger/danger-js/blob/main/README.md |
| typescript-eslint | https://github.com/typescript-eslint/typescript-eslint/blob/main/README.md |

## Patterns that held

1. **Identity line first.** One sentence naming a category the reader already knows, plus the one
   thing that sets the project apart. "An extremely fast Python linter and code formatter, written
   in Rust" (Ruff). "The uncompromising Python code formatter" (Black). "An opinionated code
   formatter" (Prettier). The reader learns what it is before anything else.
   Ruff, Black and ESLint put a short row of documentation links right under it.
2. **Opinionated tools state the bargain.** Black: "By using it, you agree to cede control over
   minutiae of hand-formatting. In return, Black gives you speed, determinism, and freedom from
   pycodestyle nagging about formatting." Standard: "No decisions to make." The philosophy is the
   pitch, at the top, not a section further down.
3. **Proof right under the pitch.** Ruff shows a benchmark chart, Prettier an input and its output,
   Standard a real error line from running it. A concrete example persuades where a feature list
   does not.
4. **Highlights are short and scannable.** Ruff, uv and ty use one line per bullet, each a claim
   with a link for details. None lists tool versions or internals.
5. **Supported variants up front.** Prettier and Biome name their languages in the first screen.
6. **Install is one to three commands**, then a link. Flags, exit codes and configuration live in
   the docs. golangci-lint and Danger JS keep almost nothing but the pitch and links.
7. **Opinionated tools answer "I disagree with rule X."** Standard's FAQ: "No. The whole point of
   standard is to save you time by avoiding bikeshedding." That is where adopters get stuck, so it
   earns a section.
8. **Status is stated** when the tool is young. ty: "ty is currently in beta", with a version
   policy explaining what can break.
9. **Credits go last.** Ruff's Acknowledgements and Oxc's third-party licenses sit at the bottom.

Patterns seen but not adopted as defaults: badges, sponsor lists, testimonials and "used by"
lists. They help mature projects with an audience to cite, and they are optional. Translated
README links (Standard, Biome) matter only when translations exist.

ESLint and Standard also show the opposite risk: their READMEs grew into documentation hubs
(ESLint's covers version support, semantic versioning, security policy and the team; Standard's
runs to about 850 lines of FAQ). That is the drift the "move to the docs" list prevents.

## What went wrong in the README under review

These are the failure modes the Skill guards against, from the nitpicker case:

- **The tagline was a feature, not the purpose.** It said the tool "fails a change only for the
  problems that change introduces". The purpose ("narrow each language to roughly one allowed way
  of doing each thing") sat in the second paragraph. Step 1 and order item 1 exist for this.
- **The example was stale and incomplete.** The message it showed no longer existed in the code,
  and it showed output without the code that caused it, so it could not show the bargain. Order
  item 3 and verify step 3 require a real run and visible input.
- **Too specific.** A list of pinned tool names, a deep project path, exit codes, and an aside
  listing languages in parentheses. The "move to the docs" list covers these.
- **Gaps.** Three supported languages and the bundled agent skill were never mentioned, and there
  was no answer to "what if I disagree with a rule", the question the project's philosophy most
  needed to answer. Step 1's fact list and order item 6 cover these.

## What the reviews caught

Two adversarial reviews ran on the first rewrite. Their findings shaped steps 4 and 5:

- **Claims true for some variants only.** "Exceptions go in the config file" was false for one
  language preset; "the analyzers ship inside the package" held for two of five; a requirements
  column omitted tools some presets need. Hence: keep each claim true for every variant it covers,
  and check tables row by row.
- **Hidden dependencies of the example.** The example's output depended on a project layout and a
  test the reader could not see. Hence: show any path or setup the example depends on.
- **Repetition.** Highlights restated the intro, the example and later sections. Hence: cut any
  highlight that restates them.
- **Mirrored files.** A docs page said it matched the README statement by statement, and the
  package description repeated the old tagline. Hence: update mirrored files in the same change.

## Sources for the method itself

- The maintainer's instructions in the nitpicker project thread (October 2026), quoted above.
- The structure of `agents-file-writer` in this suite, which separates README content (for people
  deciding about and using a project) from agent-facing guidance. This Skill takes the README side
  of that line.
