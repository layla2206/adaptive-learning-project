# Bridge — Adaptive Learning

Diagnostic-first tutoring: find the gap, explain it with sources, check for real understanding,
and retry until it sticks.

Bridge breaks each lecture topic into its real sub-ideas (not a generic outline — the actual
distinct mechanisms a student has to understand) and walks a student through each one
independently: an explanation grounded in the course's own uploaded material, a scoped follow-up
Q&A, a mastery check, hints on a wrong answer, and a re-explained retry if hints run out — before
moving to the next sub-idea. Instructors get a dashboard of per-sub-idea signals (average
understanding, follow-up volume, and flagged "gaps" where students failed a retry-check) instead
of a single topic-wide score.

## Architecture

- **Frontend** — Next.js (App Router), `src/`. Student, instructor, and admin views; its own
  `/api/*` routes proxy server-to-server to the FastAPI backend rather than exposing it directly
  to the browser.
- **Backend** — FastAPI, `backend/main.py` (single-file router). Handles document ingestion,
  RAG retrieval, sub-idea generation, and every Gemini-backed endpoint (explain, follow-up,
  mastery check, retry, diagnostics, quizzes/exams, peer-buddy).
- **Database** — Supabase/Postgres, raw SQL migrations in `backend/supabase/` (no ORM). `pgvector`
  stores chunk embeddings for retrieval.
- **AI** — Google Gemini (`gemini-3.6-flash` for generation, `gemini-embedding-001` for
  embeddings).
- **File storage** — Cloudflare R2 (uploaded course documents, generated PDFs).

## Local setup

1. Copy `.env.example` to `.env` in the repo root and fill in real values (Supabase, Cloudflare R2,
   `JWT_SECRET`, Gmail SMTP, `GEMINI_API_KEY`). The deploy-split-only vars
   (`NEXT_PUBLIC_API_URL`, `ALLOWED_ORIGINS`) can stay blank for local dev — both sides default to
   `localhost`.
2. **Frontend**:
   ```bash
   npm install
   npm run dev
   ```
   Runs at [http://localhost:3000](http://localhost:3000).
3. **Backend** (see `backend/README.md` for full detail):
   ```bash
   cd backend
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```
   Runs at `http://127.0.0.1:8000`.

## Testing

- Frontend unit tests: `npm run test:unit` · E2E: `npm run test:e2e` · Type-check: `npx tsc --noEmit`
- Backend: `cd backend && python -m pytest tests/` — Gemini is monkeypatched per-test (`mock_gemini`,
  `mock_embeddings` fixtures in `tests/conftest.py`), so the suite costs zero API quota and runs
  against the real dev Supabase project (no separate test database).

## Deployment

Split deploy: **Vercel** (frontend) + **Render** (backend, Docker — see `backend/Dockerfile` and
`render.yaml`).

1. Deploy the backend to Render first (`render.yaml` blueprint). Set every env var listed there in
   the Render dashboard (`sync: false` means Render prompts for each rather than reading a
   committed value).
2. Deploy the frontend to Vercel. Set `NEXT_PUBLIC_API_URL` to the Render service's URL.
3. Once both are live, set `ALLOWED_ORIGINS` on Render to the deployed Vercel URL (backend
   CORS only matters for a direct browser→backend call; the Next.js API routes proxy
   server-to-server and aren't subject to it).

See `.env.example` for the full, current list of required variables on each side.
