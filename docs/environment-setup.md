# Environment Setup Guide

Assumes the tech stack proposal in this repo (Python/FastAPI backend, React+Vite or Streamlit frontend, Ollama or a free-tier open-model API). Update this once the team locks in specifics.

## Everyone needs

- **Git** — for version control. Check with `git --version`; install from git-scm.com if missing.
- **A code editor** — VS Code is a common choice with good Python/JS support, but use whatever the team is comfortable with.
- **GitHub account** — for pushing this repo once it exists on GitHub.

## Backend / AI team

- **Python** — install the current stable release from python.org (I'd recommend not guessing a specific version number here since it changes; whatever the official site currently marks as the stable release is fine for this project).
- **A virtual environment tool** — `venv` (built into Python) is enough; no need for anything heavier at this scale.
- Once the repo has a `backend/requirements.txt` (to be added once the stack is finalized), the setup is typically:
  ```
  cd backend
  python -m venv .venv
  source .venv/bin/activate   # Windows: .venv\Scripts\activate
  pip install -r requirements.txt
  ```
  I haven't created `requirements.txt` yet since the exact packages (FastAPI, an Ollama client, etc.) depend on the MVP direction — verify exact package names/current versions against their docs when you add them, rather than assuming these from memory.

## AI model layer

Pick one based on the tech stack doc's recommendation:

- **If using Ollama (local):** install it from ollama.com, then pull a model with `ollama pull <model-name>` — check ollama.com/library for the current model list and exact names rather than guessing one, since availability changes.
- **If using a free-tier hosted provider (Groq, Hugging Face Inference API, OpenRouter, etc.):** sign up for an API key on that provider's site, and store it as an environment variable — never commit it to the repo. Create a `.env` file locally (already covered by `.gitignore` below) with something like:
  ```
  MODEL_API_KEY=your-key-here
  ```
  Confirm the exact environment variable name and request format against that provider's current docs when you integrate it — I don't want to hand you invented parameter names.

## Frontend team

- **Node.js** (if using React+Vite) — install the current LTS release from nodejs.org. Verify with `node --version` and `npm --version`.
- Once `frontend/package.json` exists (to be added once the stack is finalized): `cd frontend && npm install && npm run dev`.
- If using Streamlit instead, no Node.js needed — it's just a Python package (`pip install streamlit`, then `streamlit run app.py`), verify current usage against Streamlit's docs since flags/commands can change between versions.

## Secrets

Never commit API keys or `.env` files. This repo's `.gitignore` already excludes `.env` and common virtual-environment folders — double check before your first commit that nothing sensitive is staged (`git status`).

## Optional: Docker

Not recommended for the first 1–2 weeks — it adds setup overhead the team doesn't need yet for a local/demo-only build. Worth revisiting later in the internship if this moves toward something deployed and maintained longer-term.
