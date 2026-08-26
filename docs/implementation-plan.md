# Implementation Planning — Full Scope Review

Written after the team's direction became clearer: an AI tutor aimed at educational institutes, where **instructors upload content/textbooks** and a RAG pipeline grounds the tutor's answers in that material, **plus** a pacing plan feature. Nothing is locked in yet — this is meant to organize the 12 points the team already raised, flag what's missing, and suggest a sequence, not to force decisions ahead of the team discussion.

**Worth naming upfront:** this scope (instructor content upload + RAG + pacing + accounts for two user types) is meaningfully bigger than the single-feature MVP options discussed earlier (adaptive diagnostic, or a simple tutor). That's not a problem, but it does mean the "1–2 weeks" timeline from earlier conversations should be revisited as a team — either the demo scope narrows to a thin slice of this full vision, or the timeline extends. Both are fine; drifting into building the whole thing without deciding which is not.

## Where this sits in the design thinking process

You're moving from Define into Ideate/Prototype. The discipline worth keeping as you do: every feature on this list should trace back to something from the interview synthesis, not just to what sounds impressive. A few direct links already exist — Jwanda's instructor interview answer ("track their progress over time," "suggest different explanations, exercises, or difficulty levels") maps almost one-to-one onto the pacing plan feature. Worth doing this trace for each major feature before building it, and flagging anywhere a feature exists that *isn't* backed by an interview insight yet — that's a sign it needs either evidence or honest labeling as a hypothesis.

## Your 12 points, organized

### AI / ML architecture

**1. Model** — which LLM does the generation (tutor answers, pacing plan text). Per the earlier tech-stack doc: open-source/self-hosted only, so this is really "Ollama-hosted open-weight model" vs. "free-tier hosted open-weight model" (Groq/HF/OpenRouter). Not decided yet — needs a quick hands-on test on team hardware before committing.

**4. RAG structure** — now clearer: instructors upload textbook/course content → it needs to be parsed, chunked, embedded, and stored so the tutor can retrieve relevant passages when answering a student. This decision has sub-decisions that weren't broken out yet (see "what's missing" below) — chunking strategy, embedding model, and vector store are each their own choice, not one "RAG" decision.

**9. Security guardrails** — for an LLM-backed product this usually means: limiting what the model will answer (stay on the uploaded course content, don't answer unrelated or unsafe requests), handling prompt injection (a student trying to make the tutor ignore its instructions), and having a fallback response when retrieval finds nothing relevant rather than letting the model guess. Worth deciding as a concrete checklist, not left abstract.

**5. AI scoring matrix** — flagging that this phrase could mean two different things, and I don't want to assume which: (a) the prioritization matrix already built for the deck (slide 5), or (b) a new evaluation rubric for judging whether the tutor's actual answers are good (relevant, correct, appropriately paced). If it's (b) — which is what "implementation" suggests — that's a real and currently-missing piece: some way to check retrieved-passage relevance and answer quality before you trust the demo to behave well live. Worth the team clarifying which was meant.

### Data & content

**11. What data we need to keep** — ties directly to the learner profile (below) and to privacy. Concretely this needs a decision on: per-student interaction logs (what they asked, what was retrieved, whether they said it helped), instructor-uploaded content and its processed chunks/embeddings, and account/profile data. Each of those has a different sensitivity level.

**7. Student and instructor privacy** — now more concrete than before, since you're actually storing uploaded content and (if the model is a hosted free-tier API) sending student questions to a third party. Not legal advice, but worth a plain flag: if real student data ever flows through this beyond the internship demo, that's FERPA-adjacent territory in the US, and sending it to a third-party API even a free one is a real data-handling decision, not just an engineering one — worth a conversation with a Dell mentor before this goes past synthetic/test data.

**10. Learner profile** — the schema question from before, now sharper: what does the system track per student (topics covered, per-topic understanding level, interaction history) vs. per instructor (uploaded content, class roster). Two different profile shapes, not one.

**Missing: content ingestion pipeline.** RAG structure (item 4) covers what happens *after* content is embedded; there's a separate question of what file types instructors can actually upload (PDF? DOCX? plain text only?) and how that gets parsed reliably — PDF text extraction in particular is often messier than it sounds, especially for scanned or image-heavy textbook pages.

**Missing: copyright/licensing on uploaded textbooks.** Instructors uploading commercial textbook content into a system that sends chunks of it to an LLM API raises a real licensing question, not just a technical one. Not legal advice, but worth a plain flag: safest path for the demo is instructor-authored material or open educational resources (OER) rather than copyrighted commercial textbooks, until someone has actually checked what's allowed.

### Backend / infra

**12. FastAPI** — consistent with the earlier tech stack proposal, still a reasonable default.

**8. Virtual environment setup** — covered in `docs/environment-setup.md`; will need a revisit once specific RAG/auth packages are chosen (vector DB client, auth library, etc.).

**6. User authentication** — now clearly needed given two user types (instructor, student) with different permissions. Sub-decisions: roll your own (more work, more control) vs. an auth library/service (faster, less to secure yourself) — for a time-boxed build, a well-documented auth library is usually the safer choice over hand-rolled auth.

**Missing: vector database + embedding model.** Part of "RAG structure" but distinct enough to call out — needs an actual choice (e.g., an open-source vector store, and a separate open-source embedding model for turning text into vectors). Neither has been picked yet.

**Missing: file storage for uploads.** Where do the instructor-uploaded PDFs/textbooks actually live? Local disk is fine for a demo; anything more permanent needs a real decision.

**Missing: deployment plan.** Covered lightly before (local-for-demo vs. Railway) — now more relevant since two user roles logging in makes "just run it on one laptop" a bit more awkward for a live demo with multiple people. Worth deciding whether the demo needs to be reachable by more than one device at once.

### Frontend / UX

**Missing entirely from the list.** Nothing here specifies what the instructor's upload interface or the student's chat/pacing interface actually look like, or what framework builds them. This was covered in the earlier tech stack doc (React+Vite or Streamlit) but needs to be explicitly re-confirmed now that there are two distinct interfaces (instructor dashboard vs. student-facing tutor).

### Process / team ops

**3. Agile tool** — picking a board (Trello, Notion, Linear, GitHub Projects — GitHub Projects has the advantage of living right next to the repo you already have) matters less than actually using it consistently for a 5-person team; happy to help set one up once picked.

**2. Synthesizing observations into features** — already underway (`docs/interview-synthesis-instructors.md`); the discipline to keep is tracing each planned feature back to a specific insight, as noted above, and doing the same once student-side interviews happen.

**Missing: version control workflow.** You have a repo, but not a stated process for 5 people committing to it — even a lightweight rule (one branch per feature, review before merging to main) avoids the common failure mode of overwriting each other's work close to the deadline.

**Missing: timeline / sprint plan.** "1–2 weeks" was the estimate for a single-feature MVP; this scope is larger. Needs an explicit team conversation: cut scope to fit the timeline, or extend the timeline to fit the scope.

**Missing: success metrics for the demo.** What does the team actually show judges, and how will you know if it "worked"? Worth defining before building — e.g., "a judge can upload a short document, ask the tutor a question about it, and get a grounded answer; a student profile shows a pacing recommendation" is a concrete, demoable bar, versus an open-ended "make it good."

## Suggested way to sequence this

Given the scope, I'd resist building all 12+ items in parallel. A rough phasing, to adapt once the team sets a real timeline:

**Phase 0 (decisions, no code):** model choice, vector DB + embedding model, auth approach, frontend framework, agile tool, content policy (what instructors are allowed to upload). These block everything else and are cheap to decide now.

**Phase 1 (walking skeleton):** the thinnest possible end-to-end slice — one instructor uploads one document, it gets chunked/embedded/stored, one student logs in and asks one question, gets a retrieved-and-grounded answer back. No pacing plan yet, minimal auth, minimal UI. Proves the RAG pipeline actually works before investing further.

**Phase 2:** add the pacing plan feature on top of the working skeleton.

**Phase 3:** real auth/roles, guardrails, and the evaluation rubric (item 5, if that's what was meant) to check answer quality before the demo.

**Phase 4:** polish, deployment decision, success-metric dry run with the team acting as judges.

## Open items for the team to actually decide

This plan intentionally leaves these as decisions for you, not defaults I picked: model + hosting path, vector DB/embedding model, auth library, frontend framework, agile tool, what "AI scoring matrix" refers to, and — most importantly — whether to cut scope or extend timeline given this is bigger than the original MVP estimate.
