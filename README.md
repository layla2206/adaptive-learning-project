# Adaptive Learning Pace Project

Team-of-5 project (Dell Technologies AI internship) built around the HMW:

> "How might we help students learn at a pace and in a format that matches their individual understanding?"

Target users: university students.

## Status

- Design-thinking framing (problem statement, prioritization matrix, scoring criteria) is done — see the team's slide deck.
- Empathize-phase interviews: guide ready (`docs/interview-guide.md`), interviews not yet conducted.
- Implementation: **not yet started.** The MVP direction (see `docs/mvp-options-comparison.md`) is still pending a team discussion. This repo is a scaffold — folders are placeholders until that decision lands.

## Repo layout

```
docs/         Planning docs — read these first
frontend/     Student-facing UI (empty until stack/MVP is finalized)
backend/      API/server logic (empty until stack/MVP is finalized)
ai/           Model integration, prompts, evaluation notes
data/         Quiz content, sample data, schema notes
```

## Start here

1. `docs/mvp-options-comparison.md` — three candidate MVP directions, not yet decided
2. `docs/tech-stack-proposal.md` — proposed stack, with open questions flagged
3. `docs/team-roles.md` — proposed role split for the 5-person team
4. `docs/environment-setup.md` — how to get a dev environment running
5. `docs/interview-guide.md` — Empathize-phase interview guide (students + instructors)
6. `docs/github-setup.md` — how to push this repo to GitHub and add collaborators
7. `docs/interview-synthesis-instructors.md` — synthesis of round 1 instructor interview responses

## Next steps

1. Team discussion: pick an MVP direction (or the "diagnostic first, chat later" middle path).
2. Confirm AI model path: local (Ollama) vs free-tier hosted open-weight model — test both quickly on team hardware before committing.
3. Fill in `frontend/`, `backend/`, `ai/`, `data/` once the direction is set.
4. Push this repo to GitHub (no GitHub connector was available to do this automatically — see `docs/tech-stack-proposal.md` for manual push instructions).
