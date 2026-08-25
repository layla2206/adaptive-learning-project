# Tech Stack Proposal

**Status: proposal, not locked in.** Chosen to work reasonably well across all three MVP options in `mvp-options-comparison.md`, under the stated constraints: open-source/self-hosted models, no paid API budget, university-student users, 1–2 weeks, and a team that wants to actually learn the stack (Dell internship goal).

I'm flagging upfront: I'm not this team's engineer and haven't seen your laptops/hardware, so treat the hardware-dependent parts below as things to verify quickly (e.g. run one test model call) before committing, not as settled facts.

## Frontend

**Proposed: React (with Vite)**, or **Streamlit** if the team is more Python-heavy and wants to skip a separate frontend/backend split for the first working slice.

- React+Vite: standard, widely documented, keeps frontend and backend cleanly separated, more portfolio-relevant for an internship.
- Streamlit: much faster to get something on screen (a few hours vs days) since it's pure Python, but less flexible for a polished chat UI (relevant if you lean toward Option B) and less commonly used outside data-science contexts — worth checking whether that trade-off matters for what Dell wants you to demonstrate.

## Backend

**Proposed: Python + FastAPI.**

Reasoning: Python is the natural language for the AI/model layer (most open-source model tooling — Hugging Face `transformers`, Ollama's Python client, LangChain — is Python-first), and FastAPI is a common, well-documented choice for a small API serving a frontend. If you go the Streamlit route above, you may not need a separate backend at all for the MVP.

## AI / model layer — two real paths, pick based on your hardware

**Path 1: True local self-hosting via Ollama.** Ollama runs quantized open-weight models (e.g. Llama and Mistral-family models — I don't have a fully current list of what's in its library right now, so check `ollama.com/library` directly) locally behind a simple local API. Pros: no external dependency, no rate limits, works offline. Cons: needs reasonably capable hardware — I don't have verified current numbers, but as a rough starting point, plan on needing a modern laptop with at least 16GB RAM for a small quantized model, and expect it to be noticeably slower without a dedicated GPU. Confirm this against Ollama's current docs and test on an actual team laptop before relying on it for a live demo.

**Path 2: Free-tier hosted inference of open-weight models.** Providers like Groq, Hugging Face's Inference API, and OpenRouter offer free tiers that serve open-weight models (Llama/Mixtral-class) over an API — this still satisfies "open-source model, no paid budget," it's just not literally running on your own machine. This is usually faster and more demo-reliable than laptop-local inference. I'm not certain of current free-tier rate limits or exact model availability for any of these — they change often, so verify directly on each provider's site before committing, and check whether Dell's policies allow sending student data to a third-party API even a free one.

**Recommendation:** default to Path 2 for the live demo (reliability matters in front of judges) and treat Path 1 as a fallback/offline option, unless the team specifically wants the "fully self-hosted, nothing leaves our machine" story for the pitch.

## Data storage

For a 1–2 week MVP: **SQLite** (simple, file-based, zero setup) for anything structured like quiz results or user profiles, or plain JSON files if the data model is still fluid. No need for a hosted database at this stage — adding one is a later-stage decision once the MVP direction is locked in.

## Deployment

Two options:

1. **Run locally on laptops for the demo** — simplest, zero deployment risk, recommended default for a 1–2 week timeline.
2. **Deploy for judges to try before the pitch** — if you want this, Railway has a free/low-cost tier and I can help set up deployment through it later once there's a working app; happy to look into that when you're ready.

## Version control

**GitHub**, standard choice. I checked this session's available connectors and didn't find a GitHub one, so I can't create a live repo for you directly — I've scaffolded the repo structure locally instead (see the zip delivered alongside this doc). Someone on the team creates an empty repo on GitHub and pushes this scaffold to it; happy to write out the exact `git remote add` / `push` commands once you have the repo URL.

## What's still genuinely undecided

This proposal deliberately doesn't lock in an exact model name, exact free-tier provider, or React-vs-Streamlit — those depend on the MVP direction (still pending team discussion) and on quick hands-on tests (does Ollama run acceptably on your laptops? does a free-tier provider's rate limit survive a live demo?) that are worth doing before the full team commits.
