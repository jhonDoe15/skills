# Response structure

Density decides *how much* to say. Structure decides *what shape* it arrives in.
Both serve the goal set out in `SKILL.md`.

## The question every reader is asking

Not "what did you find" but **"what do I do, and what can wait?"** Structure that
answers that at a glance is doing its job. Structure that merely decorates is
noise, and costs the reader the scan it was supposed to save.

## Rules

### Answer in the first line
Someone who stops reading after one line should still have the answer. Everything
after it is support, evidence, and detail. This is the single highest-leverage
rule here — it makes the entire rest of the response optional rather than
mandatory, which is what "read the details later" actually requires.

### One idea per paragraph, two to four sentences
A paragraph covering three things cannot be skipped selectively: the reader has
to consume all of it to learn whether any of it mattered. Long paragraphs are the
specific failure that makes answers feel like a wall — more than length, it is
the inability to tell where one point ends and the next begins.

### Sets render as lists
If the content is a set of items — files, findings, settings, steps — it takes
list shape, not prose with semicolons. Two reasons: lists are scannable, and they
make omissions visible. A prose sentence can quietly cover five of eight things
and read as complete. A list of five where eight were expected does not.

### Lead each item with its identifier
The thing being discussed goes first — filename, setting, test name, in code
formatting or bold — then what about it. Readers scan the left edge of a list;
if every line starts with prose, there is nothing to scan.

```
- `drop_tables_on_start` — wipes the DB on every boot. Fix first.
```
not
```
- The most urgent problem is that the database is wiped on every boot,
  which is controlled by drop_tables_on_start.
```

### Group by what the reader must do, not by topic
"Fix before deploy / can wait / context only" beats "security / performance /
style". The reader's question is what to act on; a taxonomy that mirrors your
analysis instead of their decision makes them do the sorting you skipped.

### Headers earn their place by carrying information
If a response has more than one section, label them — but a header that says
"Findings" or "Summary" is a wasted line. `Three tests fail, one file won't
import` is a header that delivers the answer before the section is read.

### Do not structure what has no structure
A two-sentence answer needs no header, no bullet, and no bold. Ceremony on a
short answer costs more scanning than it saves, and it is the most likely way
these rules backfire. Structure is a response to complexity that is already
there; it is never something to add so the answer looks thorough.

### Prose stays prose
No JSON, YAML, or key-value dumps as a way of talking to a person. Those are data
formats — precise for machines, slow for humans, and they signal that the writer
did not do the work of deciding what mattered.

### Tables only for genuine matrices
A table earns its formatting when there are items *and* attributes — several
things compared across the same dimensions. A table with one content column is a
list wearing a costume, and it reads slower than the list would.

## Anti-patterns

- **Bullets that are full paragraphs.** That is prose with a dot in front. If an
  item needs four sentences, it is a section, not a bullet.
- **Nesting past one level.** Sub-sub-bullets mean the structure is modelling
  your analysis rather than the reader's decision.
- **Bold everywhere.** If a third of the response is bold, nothing is emphasised
  and the reader has lost the one tool that flags what matters.
- **A wall of equally-weighted sections.** If everything gets a header, the
  reader still has to read everything to find the important part. Rank them.
- **Restating the structure.** "Below you'll find three sections covering..."
  The headers already do that.

## Worked example

The same finding set, same coverage, same facts.

*Wall:*
> I went through the audit output and there's quite a lot here. The most serious
> issue is the SQL injection in the search handler, which is exploitable without
> authentication, though there's also a hardcoded credential in the deploy script
> that would be almost as bad if the repo is public. Beyond those, there are
> several dependency issues — three packages with known CVEs, two of which have
> patches available — plus a set of lower-priority items around missing rate
> limits, verbose error responses, and some TODO comments referencing security
> work that never happened.

*Shaped:*
> **Two things block the release; everything else can ship and get fixed after.**
>
> Blocking:
> - `search_handler.py:81` — SQL injection, exploitable unauthenticated
> - `deploy.sh:12` — hardcoded credential; rotate it, repo history keeps it
>
> Patch this week:
> - `requests`, `pyyaml`, `lxml` — known CVEs; patches exist for the first two
>
> Backlog:
> - No rate limit on `/search`
> - Error responses leak stack traces
> - Three security TODOs never actioned

Slightly more words. Far less reading — the first line alone answers the
question the reader actually had.
