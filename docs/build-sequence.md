# Build Sequence & Parallelization Plan

This assumes the 5-person team and the expanded scope from `implementation-plan.md` (instructor content upload → RAG-grounded tutor, plus a pacing plan, plus auth for two roles). Days below are relative ("Day 1," "Day 2–3"), not tied to a specific calendar — compress or stretch them once the team decides whether to cut scope or extend the timeline (still an open item from the last doc).

## The one thing that can't be skipped or parallelized: a short, synchronous kickoff

Before anyone splits off to work independently, the whole team needs to lock two things together, in the same conversation:

1. **The Phase 0 decisions** from `implementation-plan.md`: model + hosting path, vector DB, embedding model, auth library, frontend framework, content policy (what instructors may upload).
2. **The API contract** — a plain list of the endpoints the app needs (e.g. `POST /upload`, `POST /ask`, `GET /profile`, `POST /pacing-plan`, plus auth endpoints) with rough request/response shapes. This doesn't need to be formal — even a shared doc with example JSON per endpoint is enough.

This is the actual critical-path bottleneck. Skipping it doesn't save time — it just moves the cost to later, when the frontend person guesses a field name the backend didn't build, or the AI person's retrieval function doesn't match what the backend expects to call. Budget a real, focused meeting for this before splitting up, not a rushed five minutes.

## Five parallel tracks after kickoff

| Track | Owns | Day 1 | Day 2–3 | Day 4+ |
|---|---|---|---|---|
| **1. Backend/Infra** | FastAPI app, DB models, auth, deployment | Repo/app skeleton; stub endpoints that return fake data matching the agreed contract (this alone unblocks Track 4 immediately) | Real DB models (users, content, profiles); auth implementation | Swap stub logic for real calls into Track 2 and 3's modules as they land |
| **2. AI/RAG** | Ingestion, chunking, embedding, vector store, retrieval | Standalone script (no web app involved): parse one sample doc, chunk it, embed it, store it, manually test retrieval quality | Wrap as a clean callable module (e.g. `ingest(file)`, `retrieve(query) -> chunks`) | Hand the module to Track 1 to wire into the real `/upload` and `/ask` endpoints |
| **3. AI/Pacing + guardrails** | Understanding-level inference, pacing plan generation, safety checklist | Standalone prompt experiments for the pacing plan using the chosen model; draft the guardrail checklist as a doc (what the tutor should refuse, what happens when retrieval finds nothing relevant) | Wrap pacing logic as a callable module; implement the guardrail checks around model calls | Hand off to Track 1 to wire into `/pacing-plan` |
| **4. Frontend** | Instructor upload UI, student chat + pacing UI | Build both UI shells against the fixed contract using fake/mocked data — does not need to wait on any other track once the contract exists | Polish UI/UX; wire in auth screens against a mocked logged-in user | Swap mocked calls for Track 1's real endpoints as they go live |
| **5. PM/Data/Privacy/Synthesis** | Learner profile schema, data retention & privacy policy, content/copyright policy, agile board, interview tracing, success metrics, remaining student-side interviews | Learner profile schema and content policy — needed **by end of day 1**, since Tracks 1 and 2 depend on them | Data retention/privacy doc; keep running student-side interviews in parallel (still outstanding empathize work) | Define the demo script/success metric; trace each shipped feature back to an interview insight or flag it as an unvalidated hypothesis |

## Why this ordering is the efficient one

**Frontend and backend fully parallelize once the contract exists.** This is the single biggest time-saver available to a 5-person team — the frontend person building against fake data on day 1 instead of waiting for a real backend is most of the win here.

**The AI/RAG and pacing tracks are decoupled from the web app on purpose.** Prototyping retrieval and pacing logic as standalone scripts first (not FastAPI endpoints) means "does the AI approach actually work" gets answered fast and separately from "is it correctly plumbed into the app." If the retrieval quality turns out bad with the chosen embedding model, that's a Day 2 problem to fix in isolation, not a Day 5 problem tangled up with API debugging.

**The learner profile schema and content policy are the one data decision that can't be deferred like the others.** Everything else in `implementation-plan.md`'s "Phase 0" can genuinely wait a day if needed, but the profile schema feeds Track 1's database models and Track 4's profile UI directly — if it's not settled by end of day 1, both of those tracks stall on rework later.

**Auth can be faked almost everywhere except final integration.** Frontend can build against a pretend logged-in user; backend can build real auth on its own timeline; the only point they actually need to meet is late-stage integration.

## The part that genuinely can't be parallelized: integration

Once Tracks 2 and 3 have working standalone modules and Track 1 has real endpoints ready to receive them, wiring it all together is best done as a real synchronous session — ideally the backend person pairing with whichever of Track 2/3 is integrating, rather than solo asynchronous work. This is where cross-team bugs (mismatched field names, unexpected data shapes) actually surface, and it reliably takes longer than people estimate — worth budgeting real calendar time for it rather than treating it as a formality at the end.

## Suggested last-stage checklist before a demo

- End-to-end walkthrough matching the success metric defined in `implementation-plan.md` (e.g. "a judge can upload a document, ask a grounded question, and see a pacing recommendation")
- Guardrail checks actually tested (try to break it, not just the happy path)
- A fallback plan if the live model call is slow/unavailable during the actual demo (per the earlier tech-stack doc's reliability concerns)
