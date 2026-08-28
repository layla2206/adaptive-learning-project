# Architecture Decisions: RAG Methodology, LangChain/LangGraph, Security

**Status:** Proposed — for team review and sign-off, not yet built against.
**Date:** 2026-08-23
**Update (2026-08-28):** ADR-1's vector store recommendation (Chroma) was not what got built — see the note under item 4. The rest of this document hasn't been re-audited against the shipped implementation; treat only that one note as current.
**Deciders:** Whole team (these three decisions block Phase 1/2 of `feature-backlog-and-sequence.md`)

A note on how to read this: I'm naming real, current-to-my-knowledge tools and concepts throughout, but several of these (which embedding model currently benchmarks best, LangChain's current API shape, OWASP's current LLM risk list) change often enough that I'd rather flag "verify this against current docs before committing" than state something stale with false confidence. Treat tool names here as a credible starting point for your own quick research pass, not as a final spec to copy blindly.

---

## ADR-1: RAG Methodology

### Context

Instructors upload content (textbooks/course materials); the tutor must retrieve grounded passages to answer student questions, cite the source (non-negotiable per the interview data), and stay bounded to curriculum content when a student asks for more depth. Constraints: open-source/self-hosted or free-tier only, a 5-person team where building this is also a learning goal, and a Tier 1 scope (per the backlog) that's meant to be a thin, working skeleton before anything fancier.

RAG isn't one decision — it's at least six, and treating it as one is where teams get stuck:

1. **Document parsing** — instructor uploads are probably PDFs, possibly DOCX. Plain-text PDFs extract reasonably with common open-source libraries (e.g. `pypdf`, `pdfplumber`); a library like `unstructured` handles more file types and messier layouts if you need that breadth, at the cost of a heavier dependency. Scanned/image-only PDFs need OCR (e.g. Tesseract, also open-source) — worth explicitly scoping out for Tier 1 (assume text-based PDFs) rather than silently failing on them later.

2. **Chunking strategy** — how uploaded content gets split into retrievable pieces. Fixed-size chunking (split every N tokens with some overlap) is simplest and a reasonable starting point. Splitting on natural boundaries first (headings, paragraphs) and falling back to size limits only when a section is too long tends to produce better retrieval quality for structured educational content, since a student's question usually maps to a concept, not an arbitrary token window. Recommendation: start simple (fixed-size with overlap), only invest in structure-aware chunking if retrieval quality testing shows it's needed.

3. **Embedding model** — needs to be open-source per your constraint. Families worth knowing exist: sentence-transformers models, BGE, E5. I'm not certain which currently benchmarks best for your use case — check a current embedding benchmark (I recall MTEB is the commonly used one for this) rather than picking by name recognition. These run locally via a Python library on CPU acceptably for demo-scale data, or through a free-tier hosted embeddings endpoint if you'd rather not run them locally.

4. **Vector store** — where embeddings live for retrieval. Chroma is a common choice for smaller RAG prototypes specifically because it's lightweight and quick to set up locally. FAISS is a fast similarity-search library rather than a full database — very capable, but you handle persistence and metadata yourself. Qdrant and Weaviate are fuller-featured, self-hostable vector databases with more built-in filtering, at the cost of more setup. **Recommendation for Tier 1: Chroma**, specifically because your timeline rewards "running today" over "most scalable," and you can migrate later if you outgrow it.

   **What actually shipped: pgvector**, not Chroma — embeddings live in a `chunks.embedding vector(768)` column in the same Supabase/Postgres database everything else already uses, queried via a `match_chunks` SQL function (cosine similarity through pgvector's `<=>` operator). Worth recording why this was the better call in practice rather than leaving the divergence unexplained: the team was already running Postgres for every other table, so pgvector meant one database and one set of credentials instead of standing up and operating a second store, and metadata filtering for multi-tenancy (item 6 above) came for free as an ordinary SQL `WHERE` clause instead of a separate Chroma-specific filtering API. The tradeoff this gives up is Chroma's purpose-built lower-effort local setup — irrelevant here since Postgres was already a dependency.

5. **Retrieval strategy** — plain top-k vector similarity search is the right Tier 1 starting point. Hybrid search (combining keyword/BM25 search with vector similarity) often helps when exact terminology matters, which is common in technical course content — worth adding as a Tier 2 improvement if naive retrieval misses on exact terms. Re-ranking (retrieve a larger candidate set, then re-score with a slower, more precise model) and multi-step "agentic" retrieval (the model decides to issue more than one retrieval query, reasoning about what it still needs) are real techniques but add real complexity and latency — treat as Tier 3, and only if simple retrieval demonstrably can't support the "connects dots" / "more depth" mastery signals from the backlog.

6. **Metadata filtering for multi-tenancy** — if more than one instructor/course uploads content, retrieval must be scoped so a student in Course A can't retrieve Course B's material. This needs to be part of the vector store schema from day one (a course/institute ID stored alongside each chunk, filtered at query time) — retrofitting isolation after the fact is painful. Don't defer this one.

7. **Grounding and citation mechanism** — the generation step needs retrieved chunks injected into the prompt, and the source metadata (which chunk, which document) needs to travel through the pipeline so the UI can display it. This is the concrete engineering requirement behind the citation feature from `feature-backlog-and-sequence.md` — it's not a UI-only feature, it's a data-plumbing requirement through the whole pipeline.

8. **Graceful "not found" handling** — set a similarity-score threshold below which the system says "I don't have information on that in the uploaded materials" instead of letting the model generate an answer anyway. This is the concrete implementation of the hallucination-handling feature instructors named as a trust condition.

9. **Evaluation** — RAGAS is an open-source framework built specifically for RAG evaluation (covering things like whether an answer is faithful to retrieved context, and whether the right context was retrieved at all) — worth knowing it exists, but standing up a full evaluation framework may be more than a short timeline affords. A lighter option: hand-build a test set of 10–20 realistic questions with known correct answers/source passages, and manually grade retrieval + answer quality against it before the demo. Cheap, and directly produces the "evidence of accuracy" instructors asked for.

### Options Considered

| | **A: Naive RAG** | **B: Hybrid + optional re-ranking** | **C: Agentic multi-step RAG** |
|---|---|---|---|
| Complexity | Low | Medium | High |
| Latency | Low | Medium | Higher, and less predictable — a real concern for a live demo |
| Retrieval quality | Good enough for most direct questions | Better on exact-terminology queries | Best for multi-hop/"connect the dots" questions |
| Team learning curve | Low | Medium | High |
| Fit for Tier 1 timeline | Good fit | Fits as a Tier 2 add-on | Fits only as a Tier 3 stretch |

### Decision

Build **Option A (naive top-k RAG)** for Phase 1/2 of the backlog. Revisit hybrid search (Option B) only if manual evaluation shows naive retrieval missing on specific terminology. Treat agentic multi-step retrieval (Option C) as an explicit stretch goal tied to the "more depth" / "connects dots" mastery signals, not a Tier 1 requirement.

### Consequences

- Easier to build and debug quickly; the team can reason about exactly what's happening at each step.
- Retrieval quality on multi-hop questions (a student connecting two concepts across chapters) will likely be weaker under Option A — worth setting that expectation for the demo rather than being surprised by it.
- Revisiting chunking/embedding choices later, if quality testing shows problems, means re-indexing content — cheap at demo scale, worth knowing it's not free at real scale.

---

## ADR-2: Does LangChain/LangGraph Make Sense Here?

### Context

The team asked directly whether to adopt LangChain (a framework providing pre-built abstractions for RAG pipelines — document loaders, text splitters, vector store integrations, retrieval chains) and LangGraph (built on top, for structuring stateful, multi-step agent workflows as explicit graphs). Both are open-source and free, so the constraint isn't cost — it's complexity, debuggability, and learning curve, weighed against your Dell-internship goal of actually learning the underlying tech, not just gluing a framework together.

### Options Considered

**Option A: Hand-rolled pipeline** — direct calls to your embedding library, vector store client, and your own prompt templates; the adaptive loop (diagnose → explain → retry → recheck) managed as plain Python with an explicit session state object.

| Dimension | Assessment |
|---|---|
| Complexity | Lower to start; you write more glue code but every step is visible |
| Debuggability | High — you can see exactly what prompt was sent and why |
| Learning value | High — the team learns the underlying RAG/agent mechanics directly, which matches the internship's stated learning goal |
| Team familiarity | N/A — same for everyone, no framework-specific ramp-up |
| Risk | Some functionality (loaders, splitters) has to be built or adapted from smaller libraries instead of imported |

**Option B: LangChain (+ LangGraph if the loop needs real state-graph structure)**

| Dimension | Assessment |
|---|---|
| Complexity | Lower for standard RAG patterns; higher once you need to understand the framework's abstractions to debug something that isn't behaving as expected |
| Debuggability | Historically a common critique of LangChain (as of my last update) is that its abstraction layer can obscure exactly what's being sent to the model — worth verifying whether this is still a fair characterization of its current version before deciding |
| Learning value | Lower for understanding RAG fundamentals directly; higher for learning a widely-used industry framework, which has its own resume/internship value |
| Team familiarity | Large ecosystem and tutorials exist, which can help a team ramping up fast — but tutorials found online may target an older API version, given how quickly this framework has historically changed |
| Risk | Extra dependency weight on a project already juggling auth, RAG, guardrails, and frontend in a short timeline |

### Decision

**Recommendation: start with Option A (hand-rolled) for Phase 1/2.** For a naive RAG pipeline at your current scope, the glue code LangChain would save you is genuinely small, while the debugging clarity and learning value of writing it directly are both real and matter given the internship's explicit "learn the stack" goal.

**Reconsider LangGraph specifically** if and when the team moves into Tier 2/3 features that need genuine multi-step, branching agent behavior — e.g., agentic multi-step retrieval (ADR-1, Option C), or a retry loop with enough conditional branches that a plain Python state machine is getting hard to follow. At that point LangGraph's explicit graph structure is a reasonable, purpose-built tool for the problem, and the team will already understand the fundamentals it's abstracting over — a better position to adopt a framework from than at the very start.

This is a real trade-off, not a settled fact — worth the team weighing in given individual comfort level, and worth asking a Dell mentor if there's an internship-wide preference or expectation around using industry-standard frameworks specifically for the learning/resume value, which would be a legitimate reason to lean toward Option B instead.

### Consequences

- More initial code to write for Tier 1; less abstraction to fight if something behaves unexpectedly during demo prep.
- If the team later adopts LangGraph for Tier 2/3, expect a real ramp-up cost at that point — budget time for it rather than treating it as a drop-in swap.

---

## ADR-3: Security Mechanisms

### Context

The system has real attack surface even at demo scale: file uploads (instructor content), two-role authentication, LLM calls where both retrieved content and student input reach the model, and (if using a hosted free-tier model) student questions leaving the system to a third party. This is also a system that will contain a plausible amount of real people's data (already true of the interview synthesis docs in this repo) — worth treating security as a real requirement, not a check-box.

### Options Considered

**Option A: Minimal (just enough for a safe demo)** — auth with proper password hashing, basic file-type/size validation on uploads, API keys kept server-side only, HTTPS if deployed.

**Option B: Moderate (Option A + LLM-specific and abuse protections)** — adds prompt-injection mitigations, per-user rate limiting, dependency vulnerability scanning, and stricter upload handling.

**Option C: Full production hardening** — adds encryption at rest, formal security review/penetration testing, compliance-grade access auditing.

| Dimension | A | B | C |
|---|---|---|---|
| Effort | Low | Medium | High |
| Fit for internship demo with real (if currently synthetic) student data | Bare minimum, some real gaps | Good fit | Beyond current scope/need |
| Fit if this moves toward real deployment with real students | Not enough | Reasonable floor | The actual target eventually |

### Decision

**Target Option B.** Concretely:

- **Auth:** standard password hashing (never plaintext), server-side enforcement of instructor-vs-student permissions (not just hidden UI elements), reasonable session/token handling.
- **File uploads:** validate actual content type (not just file extension), enforce size limits, generate safe storage filenames rather than trusting user-supplied names (path traversal risk), store uploads with access control rather than in a public-facing directory.
- **Prompt injection:** structure prompts so system instructions are clearly separated from retrieved/user content, treat retrieved content as data the model reads, not instructions it follows, and don't give the model any ability to take real actions (send data elsewhere, modify files) without a human confirming — least privilege by default. OWASP publishes a Top 10 specifically for LLM applications that covers this class of risk in more depth — worth a direct read, since I don't have its current specifics memorized reliably enough to restate them as fact.
- **Secrets:** API keys live in environment variables on the backend only, never shipped to frontend code or committed to the repo (already covered by `.gitignore`).
- **Rate limiting:** per-user limits on generation-heavy endpoints, partly for abuse prevention and partly to protect your free-tier quota from being exhausted by one user or a bug before a demo.
- **Dependency hygiene:** enable GitHub's automated dependency vulnerability alerts on the repo (low effort, on by default for many repos, worth confirming it's active) and periodically check for known-vulnerable packages.
- **Standard web hygiene:** parameterized queries/an ORM (no raw string-built SQL), escaping any model- or user-generated content rendered in the frontend to avoid XSS.

### Consequences

- Real but bounded extra engineering time versus Option A — worth it given the repo already contains real instructor names and will eventually touch real student interactions.
- Option C's items (encryption at rest, formal pen testing, compliance auditing) are being explicitly deferred, not forgotten — worth revisiting if this moves past the internship demo toward real institutional use.

---

## What else is worth having on the radar (not full ADRs, but real gaps)

- **Observability during development** — logging what was retrieved and what exact prompt was sent for each answer. Unglamorous, and exactly the thing you'll wish you had the first time the tutor gives a confusing answer and nobody can figure out why.
- **Cost/quota monitoring** — track free-tier API usage so the team isn't rate-limited mid-demo.
- **Testing the AI pieces specifically** — the manual eval set from ADR-1 doubles as this; also worth a few known-tricky test questions (ambiguous, off-topic, adversarial) run before the demo, not during it.
- **Prompt versioning** — even a plain changelog of "what the system prompt says now and why it changed" saves real confusion once more than one person is iterating on it.
- **Fallback behavior** — what the demo does if the live model call is slow or the API is down, consistent with the reliability concern already flagged in the tech-stack proposal.
- **Basic content moderation** on student input, in case of abusive or inappropriate messages to the tutor — doesn't need to be sophisticated for a demo, but shouldn't be entirely absent either.
