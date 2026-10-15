# Sources and decisions

This file records why `to-humans` says what it says. It is for maintainers and
is not part of the skill's execution path.

Use it before changing the skill. When new evidence arrives, find the decision
it touches. You can then tell whether the idea is new, was considered and
rejected, or is already implemented, and argue with that specific entry.

## Adding an entry

Give each decision a descriptive heading and these fields. Leave a field out
only when it does not apply.

- **Status:** Adopted, Rejected, or Proposed, with the date.
- **Rule:** the `SKILL.md` section and the wording it produced.
- **Sources:** names from the source register below.
- **Evidence:** the specific finding, with numbers where the source gives them.
- **Transfer:** why the evidence applies to this skill, and where it stops
  applying.
- **Eval:** the case IDs in `evals/role.json` that exercise the rule.
- **Revisit if:** the result that would reopen the decision.

Refer to other decisions and sources by their heading names. Do not number
them. The skill's own rule against coined labels applies to this file.

Change an entry's status instead of deleting it. A rejected idea is the record
that stops the next review from proposing it again without new evidence.

## Source standard

Rank evidence in this order, and say which kind each entry rests on:

1. **Peer-reviewed** studies with measured outcomes: experiments, field
   studies, or large corpora.
2. **Preprints** with measured outcomes. Usable, but note that review is
   pending.
3. **Industry research**, such as an AI lab's blog analysis or a usability
   firm's study. Supporting evidence only.
4. **Convention**: government guidance, corporate style guides, and
   practitioner advice. It can show a practice is widespread, but it never
   supports a rule on its own. These sources can be dated or carry an agenda.

Prefer findings that several independent studies agree on. Say so when a
decision rests on one study. Every number below was checked against the
primary source on the date given, unless the entry says otherwise.

## Source register

Sources are grouped by what they inform. Each was read or verified between
2026-10-13 and 2026-10-15.

### AI fiction and narrative structure

- **StoryScope.** Russell, Rajendhran, Pham, Iyyer, Wieting. *StoryScope:
  Investigating idiosyncrasies in AI fiction.* arXiv 2604.03136, preprint.
  <https://arxiv.org/abs/2604.03136>. Compares 10,272 human stories with
  versions by five LLMs, using 304 narrative features. It studies fiction,
  measures detectability rather than reader preference, and compares edited
  published stories with single AI generations.

### How AI prose differs from human prose

- **Grammatical style of instruction-tuned models.** Reinhart, Markey,
  Laudenbach, Pantusen, Yurko, Weinberg, Brown. *Do LLMs write like humans?
  Variation in grammatical and rhetorical styles.* PNAS 122, 2025.
  <https://arxiv.org/abs/2410.16107>. Peer-reviewed.
- **Excess vocabulary in biomedical abstracts.** Kobak, González-Márquez,
  Horvát, Lause. *Delving into LLM-assisted writing in biomedical publications
  through excess vocabulary.* Science Advances, 2025.
  <https://arxiv.org/abs/2406.07016>. Peer-reviewed.
- **Model idiosyncrasies.** Sun, Yin, Xu, Kolter, Liu. *Idiosyncrasies in
  Large Language Models.* ICML 2025.
  <https://proceedings.mlr.press/v267/sun25z.html>. Peer-reviewed.
- **Repetitive slop patterns.** Paech, Roush, Goldfeder, Shwartz-Ziv.
  *Antislop.* arXiv 2510.15061. Preprint; an ICLR 2026 listing is not yet
  confirmed. <https://arxiv.org/abs/2510.15061>.
- **Human slop judgments.** Shaib, Chakrabarty, Garcia-Olano, Wallace.
  *Measuring AI "Slop" in Text.* arXiv 2509.19163. Preprint.
  <https://arxiv.org/abs/2509.19163>.
- **ChatGPT versus human experts.** Guo et al. *How Close is ChatGPT to Human
  Experts?* arXiv 2301.07597. Preprint, GPT-3.5 era.
  <https://arxiv.org/abs/2301.07597>.
- **Chatbot verbosity.** Borisov, Gröger, Mikhael, Schreiber. *Do Chatbot LLMs
  Talk Too Much? The YapBench Benchmark.* arXiv 2601.00624. Preprint.
  <https://arxiv.org/abs/2601.00624>.

### What readers notice and prefer

- **Expert detection cues.** Russell, Karpinska, Iyyer. *People who frequently
  use ChatGPT for writing tasks are accurate and robust detectors of
  AI-generated text.* ACL 2025. <https://aclanthology.org/2025.acl-long.267>.
  Peer-reviewed.
- **Expert edits to AI writing.** Chakrabarty, Laban, Wu. *Can AI writing be
  salvaged?* CHI 2025. <https://arxiv.org/abs/2409.14509>. Peer-reviewed.
  About 77% of its paragraphs are literary fiction.
- **Edit-based quality rewards.** Chakrabarty, Laban, Wu. *AI-Slop to
  AI-Polish?* COLM 2025. <https://arxiv.org/abs/2504.07532>. Peer-reviewed.
- **Simple headlines.** Shulman, Markowitz, Rogers. *Reading dies in
  complexity: Online news consumers prefer simple writing.* Science Advances
  10(23), 2024. Abstract verified through
  <https://www.hks.harvard.edu/publications/reading-dies-complexity-online-news-consumers-prefer-simple-writing>.
  Peer-reviewed.

### Trust, uncertainty, and training biases

- **Explanation length and confidence.** Steyvers et al. *What large language
  models know and what people think they know.* Nature Machine Intelligence,
  doi:10.1038/s42256-024-00976-7. <https://arxiv.org/abs/2401.13835>.
  Peer-reviewed.
- **First-person uncertainty.** Kim, Liao, Vorvoreanu, Ballard, Vaughan.
  *"I'm Not Sure, But...".* FAccT 2024. <https://arxiv.org/abs/2405.00623>.
  Peer-reviewed.
- **Reluctance to express uncertainty.** Zhou, Hwang, Ren, Sap. *Relying on the
  Unreliable.* arXiv 2401.06730. Preprint; an ACL 2024 listing is not
  confirmed from the official page. <https://arxiv.org/abs/2401.06730>.
- **Assertiveness and perceived errors.** Hosking, Blunsom, Bartolo. *Human
  Feedback is not Gold Standard.* ICLR 2024.
  <https://arxiv.org/abs/2309.16349>. Peer-reviewed.
- **Sycophancy.** Sharma et al. *Towards Understanding Sycophancy in Language
  Models.* ICLR 2024. <https://arxiv.org/abs/2310.13548>. Peer-reviewed.
- **Length bias in training.** Singhal, Goyal, Xu, Durrett. *A Long Way to Go:
  Investigating Length Correlations in RLHF.* arXiv 2310.03716. Preprint.
  <https://arxiv.org/abs/2310.03716>.
- **Format bias in judges and reward models.** Zhang, Xiong, Chen, Zhou,
  Huang, Zhang. *From Lists to Emojis: How Format Bias Affects Model
  Alignment.* ACL 2025. <https://aclanthology.org/2025.acl-long.1308/>.
  Peer-reviewed.
- **Style control in Chatbot Arena.** Li, Angelopoulos, Chiang. *Does style
  matter?* LMSYS blog, August 2024.
  <https://www.lmsys.org/blog/2024-08-28-style-control>. Industry research.

### Messages sent under the user's name

- **Perceived AI authorship.** Jakesch, French, Ma, Hancock, Naaman.
  *AI-Mediated Communication.* CHI 2019.
  <https://s.tech.cornell.edu/assets/papers/aimc.pdf>. Peer-reviewed.
- **AI disclosure and trust.** Schilke, Reimann. *The transparency dilemma:
  How AI disclosure erodes trust.* Organizational Behavior and Human Decision
  Processes 188, 2025. <https://par.nsf.gov/biblio/10597787>. Peer-reviewed.
- **Disclosure by writing type.** Nakano, Takezawa, Matulic, Yang, Yatani.
  *Understanding Reader Perception Shifts upon Disclosure of AI Authorship.*
  IUI 2026, per the authors' acceptance note.
  <https://arxiv.org/abs/2510.24011>.
- **AI-assisted workplace email.** Cardon, Coman. *Professionalism and
  Trustworthiness in AI-Assisted Workplace Writing.* International Journal of
  Business Communication, 2025.
  <https://journals.sagepub.com/doi/10.1177/23294884251350599>. Peer-reviewed.
  The percentages below come from the university press release, because the
  full text is paywalled: <https://news.ufl.edu/2025/08/writing-ai-work/>.
- **Perceived AI empathy.** Rubin, Li, Zimmerman, Ong, Goldenberg, Perry.
  *Comparing the value of perceived human versus AI-generated empathy.* Nature
  Human Behaviour 9(11), 2025. Peer-reviewed.

### Reading, naming, and abbreviations

- **Identifier names and comprehension speed.** Hofmeister, Siegmund, Holt.
  *Shorter identifier names take longer to comprehend.* IEEE SANER 2017.
  <https://www.se.cs.uni-saarland.de/publications/docs/HoSeHo17.pdf>.
  Peer-reviewed.
- **Identifier names and description quality.** Lawrie, Morrell, Feild,
  Binkley. *Effective identifier names for comprehension and memory.*
  Innovations in Systems and Software Engineering 3, 2007. Peer-reviewed.
- **Expanded abbreviations in health records.** Grossman Liu et al. *Effect of
  Expansion of Abbreviations and Acronyms on Patient Comprehension of Their
  Health Records.* JAMA Network Open 5(5), 2022.
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC9107024>. Peer-reviewed randomized
  trial.
- **Jargon and processing fluency.** Shulman, Dixon, Bullock, Colón Amill.
  *The Effects of Jargon on Processing Fluency, Self-Perceptions, and
  Scientific Engagement.* Journal of Language and Social Psychology, 2020.
  Peer-reviewed. Abstract only.
- **Curse of knowledge in markets.** Camerer, Loewenstein, Weber. *The Curse
  of Knowledge in Economic Settings.* Journal of Political Economy 97(5), 1989.
  Peer-reviewed.
- **Curse of knowledge in predicting others.** Tullis, Feder. *The "curse of
  knowledge" when predicting others' knowledge.* Memory & Cognition 51, 2023.
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC9794110/>. Peer-reviewed.
- **Growth of scientific acronyms.** Barnett, Doubleday. *The growth of
  acronyms in the scientific literature.* eLife 9, 2020. Peer-reviewed.
- **Abbreviations and audience alienation.** Hales, Williams, Rector.
  *Alienating the Audience.* APS Observer, 2017. Magazine article reporting an
  unpublished experiment. Convention-level.
- **Subtractive changes.** Adams, Converse, Hales, Klotz. *People
  systematically overlook subtractive changes.* Nature 592, 2021.
  Peer-reviewed. Abstract and lab summary only.
- **Skimming by satisficing.** Duggan, Payne. *Skim reading by satisficing:
  evidence from eye tracking.* CHI 2011. Peer-reviewed. Abstract only.
- **Initial mention and the main idea.** Kieras. *Initial mention as a signal
  to thematic content in technical passages.* Memory & Cognition 8(4), 1980.
  Peer-reviewed.
- **Headings and topic structure.** Lorch, Lemarié, Chen. *Signaling topic
  structure via headings or preview sentences.* Psicología Educativa 19(2),
  2013. Peer-reviewed.
- **Highlighting and comprehension.** Huth, Koch, Awad, Weiskopf, Kurzhals.
  *Eye Tracking on Text Reading with Visual Enhancements.* ETRA 2024.
  <https://arxiv.org/abs/2404.05572>. Peer-reviewed short paper, 12
  participants.
- **Learning from incident reports.** Sillito, Pope. *Learning From Lessons
  Learned.* CHASE 2024. <https://arxiv.org/abs/2402.09538>. Peer-reviewed
  qualitative study.

## Decisions

### Answer first, with no preamble or praise opener

- **Status:** Adopted before this record existed. Extended 2026-10-15.
- **Rule:** *Write for the reader*. Lead with the answer. No preamble,
  restated request, or praise or agreement opener. A closed question can be
  answered in full by the answer. A wrong premise is corrected first.
- **Sources:** initial mention and the main idea; skimming by satisficing;
  chatbot verbosity; model idiosyncrasies; sycophancy.
- **Evidence:** Readers matched a passage's main idea more closely when the
  theme sentence came first. Skimmers read until the information rate drops,
  then skip ahead. Chatbots pad closed questions with preambles and restated
  prompts, and padding rose slightly with newer release dates (r = 0.21 over
  57 models). Claude's own characteristic openers include "based on" and
  "according to". Matching the user's views is one of the most predictive
  features of human preference ratings, which trains models toward agreement.
- **Transfer:** The measured benefit of answer-first is comprehension of the
  main point, not decision speed. No controlled test of BLUF-style structure
  was found, so speed claims stay out of this record. The premise-correction
  clause is about where disagreement goes, not whether to hold a position.
- **Eval:** `role/premise-correction`, `role/short-complete-answer`, and every
  case with an answer-first expectation.
- **Revisit if:** blind comparisons show readers misread corrections that
  arrive before context.

### Own uncertainty in the first person

- **Status:** Adopted, 2026-10-15. Extends the existing rule to keep
  uncertainty visible.
- **Rule:** *Write for the reader*. State confidence at the claim it affects.
  Use first-person ownership, separate checked from assumed, and never trim a
  material hedge to save words.
- **Sources:** first-person uncertainty; explanation length and confidence;
  reluctance to express uncertainty; assertiveness and perceived errors.
- **Evidence:** In a preregistered study of 404 people, first-person
  uncertainty reduced reliance on wrong answers and improved accuracy, while
  impersonal phrasing had weaker, non-significant effects. Longer explanations
  raised readers' confidence without improving their ability to tell right
  from wrong answers (AUC 0.54 for long explanations). Models that stated
  confidence were wrong 47% of the time on average, and preference data used
  in training is biased against uncertain text. Raters judged more assertive
  outputs as containing fewer errors.
- **Transfer:** Four independent studies point the same way. The tasks were
  question answering, not status reports, but the reader's problem is the
  same: telling verified claims from guesses.
- **Eval:** `role/owned-uncertainty`, `role/short-complete-answer`.
- **Revisit if:** first-person hedges start appearing on claims that were
  verified, which would add noise.

### Make one deletion pass

- **Status:** Adopted, 2026-10-15. Extends the shortest-complete-explanation
  rule.
- **Rule:** *Write for the reader*. Before finishing, make one pass that only
  deletes.
- **Sources:** subtractive changes; expert edits to AI writing; human slop
  judgments; length bias in training; format bias in judges and reward models.
- **Evidence:** Across eight experiments, people defaulted to adding and
  overlooked improvements made by removing. Unnecessary exposition was 18% of
  expert edits to AI paragraphs. Relevance and information density were among
  the strongest predictors of human slop judgments. Length explained 70% to
  90% of RLHF reward gains in two of three settings tested, so the pull toward
  length comes from training rather than reader need.
- **Transfer:** The subtraction bias was measured in people, not models. It
  is used here as a reason for an explicit deletion step, not as evidence
  about models.
- **Eval:** `role/short-complete-answer`, `role/no-restated-ending`.
- **Revisit if:** the pass starts cutting required coverage or hedges.

### End when the content ends

- **Status:** Adopted, 2026-10-13. Extended 2026-10-15 with stock sympathy
  and enthusiasm.
- **Rule:** *Write for the reader*. No restated conclusion, stated lesson,
  generic sign-off, or stock sympathy or enthusiasm. A one-line offer of
  specific unrequested material stays allowed.
- **Sources:** StoryScope; ChatGPT versus human experts; perceived AI empathy.
- **Evidence:** AI narrators state the story's theme in 77% of stories,
  humans in 52%, and the paper's Claude fingerprint includes epilogues and
  quiet endings. In expository question answering, ChatGPT tends to define,
  explain, then summarize. Readers judged it more helpful in 57% of English
  pairs overall but only 23% in the medical domain. Across 9 studies with
  6,282 participants, identical supportive replies were rated less empathic
  when attributed to AI.
- **Transfer:** The reply-level form of the habit is the closing recap, the
  "key takeaway" paragraph, and the "let me know if" sign-off. Stock sympathy
  from an assistant is discounted by readers.
- **Eval:** `role/no-restated-ending`, `role/what-happened-recap`,
  `role/short-complete-answer`.
- **Revisit if:** blind comparisons show readers prefer a closing summary for
  some length or type of reply.

### Prefer named specifics over categories

- **Status:** Adopted, 2026-10-13.
- **Rule:** *Write for the reader*. Use the actual file, version, number,
  person, team, system, or source when the context supplies it. Never invent
  one.
- **Sources:** StoryScope; model idiosyncrasies.
- **Evidence:** AI references to other works are vague allusions 72% of the
  time, human references 50%. Humans name specific texts and authors in 47% of
  stories, AI in 24%.
- **Transfer:** In work prose the same habit produces "some services" where
  the reader needs `auth-gateway`. The never-invent clause keeps the rule
  inside the `writing-foundation` grounding guarantee. The fiction evidence
  is analogical; no work-prose study of vague reference was found.
- **Eval:** `role/named-specifics`, `role/human-status`.
- **Revisit if:** outputs start padding replies with names that do not help
  the reader act.

### Use descriptive names, not coined labels

- **Status:** Adopted, 2026-10-15. Raised by the skill owner, who sees agents
  invent short codes for tasks and options in interfaces people read.
- **Rule:** *Write for the reader*. Refer to options, tasks, findings, and
  decisions by a short descriptive name. Do not coin letters, numbers, or codes
  for them, even with a definition. Use an identifier only when it exists
  outside the reply or the reader introduced it. Spell out abbreviations the
  reader may not know.
- **Sources:** identifier names and comprehension speed; identifier names and
  description quality; expanded abbreviations in health records; jargon and
  processing fluency; curse of knowledge in markets; curse of knowledge in
  predicting others; growth of scientific acronyms; abbreviations and audience
  alienation.
- **Evidence:**
  - With 72 professional developers, full-word identifiers led to finding
    defects 19% faster than single letters or abbreviations. A separate study
    found single-letter names produced the poorest descriptions of code (3.10
    against 3.91 for full words). A coined code like "D3" carries no more
    meaning than a single letter.
  - In a randomized trial with 60 patients, comprehension rose from 62% to 95%
    when abbreviations were spelled out. "HF" alone went from 20% to 100%.
  - Jargon reduced processing fluency even when definitions were provided.
    This is why the rule does not allow "define it once, then use the code".
  - People who know something fail to ignore that knowledge when predicting
    what others know. Market incentives cut the bias by only about half, and
    reducing reliance on one's own knowledge did not fix it. The writer who
    coined a label always knows what it means, so the rule is mechanical
    rather than left to judgment.
  - Of more than a million acronyms coined in research papers, 79% were used
    fewer than 10 times and about 0.2% became regular vocabulary.
  - The abbreviations column recommends spelling terms out on every use, but
    reports no separate statistics. It is cited as convention only.
- **Transfer:** The code-naming studies are the closest analogue: an agent's
  coined label works like a single-letter variable that the reader must look
  up. No study measured coined labels in AI replies directly.
- **Eval:** `role/no-coined-labels`, with mechanical checks for invented
  option letters, numbered option labels, and letter-digit codes.
- **Revisit if:** a long reply genuinely needs a compact reference that a
  descriptive name cannot provide, such as a table of many similar items.

### Name the thing directly

- **Status:** Adopted, 2026-10-13. Sharpens the existing plain-wording rule.
- **Rule:** *Write for the reader*. Use a metaphor only when it explains
  something the literal statement cannot.
- **Sources:** StoryScope; simple headlines; expert edits to AI writing.
- **Evidence:** AI conveys emotion through bodily sensation and metaphor in
  81% of stories, humans in 38%. Across more than 30,000 headline A/B tests,
  readers preferred simpler headlines, and a follow-up study found
  professional writers did not share the readers' attention bias toward
  simpler ones. Awkward word choice and clichés were 28% and 17% of expert
  edits to AI paragraphs.
- **Transfer:** Writers do not reliably feel the cost of complexity, which
  supports a stated rule over a judgment call.
- **Eval:** `role/no-restated-ending`, `role/machine-sentence-patterns`.
- **Revisit if:** judges flag literal explanations as harder to follow for
  non-specialist readers.

### Scan structure: front-load, structure by content, no habitual bold

- **Status:** Adopted, 2026-10-15. Extends the existing headings-and-lists
  rule.
- **Rule:** *Write for the reader*. Start each paragraph and list item with
  its point. Let structure follow the content. Use headings for several
  distinct topics and lists for parallel items or steps. Bold at most one
  item.
- **Sources:** skimming by satisficing; initial mention and the main idea;
  headings and topic structure; highlighting and comprehension; format bias in
  judges and reward models; style control in Chatbot Arena; ChatGPT versus
  human experts.
- **Evidence:**
  - Headings and preview sentences both helped readers outline a text's topic
    structure; headings did not improve memory for facts.
  - Highlighting drew readers' eyes but did not significantly improve
    comprehension, in a 12-person exploratory study.
  - In format-only pairs, GPT-4 Turbo as a judge preferred the bold version
    89.5% of the time and lists 75.75% of the time, and most reward models
    preferred bold 95% to 99% of the time. Human Arena votes showed only small
    markdown effects once length was controlled (lists 0.031, bold 0.019).
  - ChatGPT expository answers default to a define, explain, then summarize
    shape regardless of the question.
- **Transfer:** The pull toward bold and lists comes from automated judges and
  reward models far more than from readers. The front-loading rule rests on
  skimming behavior and main-idea studies; the "early content" detail of the
  skimming study was not verifiable from its abstract.
- **Eval:** `role/no-coined-labels` (bold limit), `role/human-status` (scan
  structure).
- **Revisit if:** readers of long multi-topic replies ask for more emphasis.

### Messages sent under the user's name stay specific

- **Status:** Adopted, 2026-10-15.
- **Rule:** *Match the purpose*. Thanks, congratulations, apologies, and
  feedback the user sends as themselves tie every sentence to specific people
  and events and keep the user's voice.
- **Sources:** perceived AI authorship; AI disclosure and trust; disclosure by
  writing type; AI-assisted workplace email; perceived AI empathy.
- **Evidence:**
  - Profiles readers believed were AI-written were trusted less, but only when
    readers thought some profiles were human.
  - Across 13 experiments, people who disclosed AI use were trusted less than
    those who did not, and being exposed by others was worse.
  - Disclosure lowered perceived trustworthiness, caring, competence, and
    likability, with the sharpest drops for social and interpersonal writing.
  - In a survey of about 1,100 professionals, 40% to 52% rated heavily
    AI-assisted manager emails as sincere, against 83% for low assistance.
    These percentages come from the press release.
- **Transfer:** The penalty comes from the reader suspecting AI, and it is
  largest for warm messages. Factual updates carry a smaller penalty. Five
  independent studies agree on the direction.
- **Eval:** `role/sent-as-user-message`.
- **Revisit if:** the rule produces stiff messages, or the user reports that
  drafts no longer sound like them.

### Rewrite machine-made sentence patterns

- **Status:** Adopted, 2026-10-15. Replaces the vague "writing patterns that
  feel artificial" with named patterns.
- **Rule:** *Keep contextual voice*. Check relevance and density first, then
  rewrite trailing "-ing" commentary, nominalizations, unprompted contrasts,
  reflexive lists of three, and verbs that assert importance. Restructure or
  delete rather than reword.
- **Sources:** grammatical style of instruction-tuned models; excess
  vocabulary in biomedical abstracts; repetitive slop patterns; expert
  detection cues; human slop judgments; model idiosyncrasies.
- **Evidence:**
  - GPT-4o used present participial clauses at 5.3 times the human rate and
    nominalizations at 2.1 times. Base Llama 3 models stayed near human rates,
    so instruction tuning causes the habit.
  - Of 379 excess style words in 2024 biomedical abstracts, 66% were verbs
    and 14% adjectives. "Delves" appeared 28 times more often than expected.
  - "It's not X, it's Y" appeared up to 6.3 times more often than in human
    writing in some models.
  - Expert annotators cited vocabulary in 53% of their explanations and
    sentence-structure patterns, such as "not only ... but also" and lists of
    three, in 36%.
  - Human slop judgments were predicted by relevance, density, and tone more
    than by word lists, which is why relevance and density come first.
  - Model fingerprints largely survived paraphrasing (about 91% accuracy) but
    dropped under summarization (about 58%). Rewording keeps the patterns;
    deleting removes them.
- **Transfer:** The grammar and vocabulary studies cover academic, news, and
  blog text, which is close to work prose. The contrast-frame figure comes
  from a preprint and may be measured on creative writing.
- **Eval:** `role/machine-sentence-patterns`, with mechanical checks.
- **Revisit if:** models stop producing these patterns, or the list grows into
  a word ban that misses relevance problems.

### Structure for "what happened" explanations

- **Status:** Adopted, 2026-10-13.
- **Rule:** *Match the purpose*, the five-step list for an account of what
  happened. A requested timeline or neutral record keeps chronological order.
- **Sources:** StoryScope; initial mention and the main idea; learning from
  incident reports.
- **Evidence, by step:**
  1. Outcome first. AI tells stories in strict order. Humans open at the point
     that matters and go back. Main ideas stated first are identified better.
  2. Late discovery first. Humans use revelations that force a re-reading of
     earlier scenes. In a recap, stating the root cause up front gives the
     reader that re-reading without the wait.
  3. Side threads only when they connect. Humans integrate subplots into the
     main theme in 42% of stories, AI in 21%.
  4. Weight by importance. StoryScope's Claude fingerprint is flat event
     escalation.
  5. Credit what actually resolved it. Resolution is driven by the
     protagonist's choices in 69% of AI stories and 46% of human ones.
- **Transfer:** A recap is a small story, so this is StoryScope's closest
  analogy. No study measuring how readers understand incident reports was
  found. The one qualitative study found practitioners rarely consider
  reports worth reading. These steps rest on narrative analogy and general
  main-idea research, not on incident-specific evidence.
- **Eval:** `role/what-happened-recap`.
- **Revisit if:** readers of real recaps ask for chronological order, or the
  rule starts reordering requested timelines.

### Direct address as a review prompt

- **Status:** Adopted as a review prompt, not a rule, 2026-10-13.
- **Rule:** *Keep contextual voice*. Added to the review-prompt list.
- **Sources:** StoryScope.
- **Evidence:** Humans address the reader directly in 28% of stories, AI in
  7%.
- **Transfer:** Weak and analogical. Addressing the reader suits replies and
  instructions but not neutral records, so it stays a judgment call.
- **Eval:** none yet.
- **Revisit if:** reviews find passive, reader-less phrasing is a recurring
  complaint.

### Active voice stays a review prompt

- **Status:** Reaffirmed, 2026-10-15.
- **Rule:** *Keep contextual voice*. Active voice remains a review prompt, not
  a mandatory rewrite.
- **Sources:** grammatical style of instruction-tuned models.
- **Evidence:** GPT-4o used the agentless passive at roughly half the human
  rate. Its stiffness comes from nominalizations and participial clauses, not
  passives.
- **Transfer:** A blanket active-voice rule would target a pattern models
  already underproduce. The sentence-pattern rule targets the real causes.
- **Revisit if:** outputs show heavy passive use in practice.

### No em dash

- **Status:** Adopted before this record existed. Reaffirmed 2026-10-15 with
  a known limit.
- **Rule:** *Keep contextual voice*.
- **Sources:** none found. StoryScope adds context.
- **Evidence:** No study in this review measured em dashes or their effect on
  readers. StoryScope describes surface signals such as em dashes as fleeting,
  and found that editing out surface artifacts lowered narrative-feature
  detection by only 1.6 points.
- **Transfer:** The rule is cheap and mechanically checkable, but it rests on
  convention. The sentence patterns and relevance checks likely matter more.
- **Eval:** mechanical `forbidden_patterns` in every role and outcome case.
- **Revisit if:** default model output stops producing em dashes, making the
  rule dead weight.

### Fiction structure features

- **Status:** Rejected for this skill, 2026-10-13.
- **Sources:** StoryScope.
- **Evidence:** Subplot counts, character agency, dialogue used as
  philosophical debate, and setting that mirrors a character's mood.
- **Transfer:** None. These describe fiction and have no counterpart in
  replies or updates. They are a strong starting list for a future fiction
  writing skill.

### Human-likeness as the goal

- **Status:** Rejected, 2026-10-13. Reaffirmed 2026-10-15.
- **Sources:** StoryScope; expert edits to AI writing.
- **Evidence:** StoryScope measures detectability. Some human traits it found,
  such as delayed revelation, would make work prose harder to read. The
  editing study shows readers reward specific improvements, not resemblance
  to human text as such.
- **Transfer:** The skill optimizes reader effort and trust. A finding is
  adopted only when the change also lowers reader effort or protects trust.
  Answer-first ordering is the clearest case where the skill deliberately
  differs from natural human writing.

### Bold for emphasis on key requests

- **Status:** Rejected, 2026-10-15.
- **Sources:** highlighting and comprehension; format bias in judges and
  reward models.
- **Evidence:** A popular claim that bolding key requests raises response
  rates rests on an unpublished draft. The peer-reviewed eye-tracking study
  found highlighting drew attention without improving comprehension.
- **Transfer:** No evidence supports more bold. The scan-structure rule limits
  bold to one item.

### Ask one clarifying question for unclear requests

- **Status:** Proposed, 2026-10-15. Out of scope for this skill.
- **Sources:** chatbot verbosity.
- **Evidence:** Chatbots answer ambiguous inputs with unrequested content
  where a clarifying question would do.
- **Transfer:** Whether to ask or answer is a decision about the work, which
  belongs to the Primary outcome, not to expression. Recorded so the idea is
  not lost.

## Rules without a recorded source

These rules predate this file. Add a source or a decision entry when one is
known.

- Shortest complete explanation, and unrequested detail left for follow-up.
  Partly supported by the deletion-pass sources.
- Decision support: recommendation, basis, material uncertainty, change
  condition.
- Neutral record without invented opinion.
- Contextual voice over standardized prose.
- Non-prose work products stay unchanged.
