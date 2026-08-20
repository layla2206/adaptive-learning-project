# MVP Direction — Comparison for Team Discussion

**Status: not decided.** This is discussion material for the team, not a final call. Constraints assumed: university students as the target users, open-source/self-hosted models only (no paid API budget), 1–2 weeks to a working build.

## Option A — Adaptive diagnostic → pacing plan

A student takes a short diagnostic on a topic; the system infers their understanding level and generates a paced study plan or next-step recommendation.

- **Effort:** Low–medium. The scoring logic can start rule-based (no model needed) with an LLM layered in just for generating the plan/explanation text.
- **What it proves:** Most directly demonstrates the HMW itself — pace matching understanding. Judges can take the quiz themselves and see the output change.
- **Risk:** Lowest of the three. Doesn't depend on a content library. If the model call is slow or flaky during a live demo, the quiz/scoring part still works and the plan generation can fall back to a templated version.
- **Stack implications:** Simple frontend, lightweight backend, one well-scoped LLM call.

## Option B — AI tutor chat with adjustable depth

A conversational interface that re-explains concepts at different depth or pace depending on how the student responds.

- **Effort:** Medium–high. Needs a working chat UI, conversation state, and prompting that reliably shifts explanation depth.
- **What it proves:** Most vivid and engaging demo if it works — judges get to "talk" to the tutor.
- **Risk:** Highest. I'm not fully certain how consistently a small open-weight model will follow nuanced "adjust your depth" instructions without real testing — I'd treat this as something to prototype and test early rather than assume will work, since smaller open models generally need more careful prompting than large proprietary ones to stay reliable. Live-chat latency on self-hosted infra is also a real risk in front of judges.
- **Stack implications:** Chat UI, backend with conversation memory, an open-weight model with decent instruction-following.

## Option C — Content format router

Given one topic, serve it as video, text, or interactive content based on a student profile.

- **Effort:** Medium, but bottlenecked by needing real content to route between. In 1–2 weeks this likely means a small curated demo set rather than actual content generation.
- **What it proves:** Format personalization, which is part of the HMW — but the "AI" is less visible unless the matching/classification step itself uses a model.
- **Risk:** Medium. Less technically risky than B, but may look less like an "AI use case" to judges unless paired with generation.
- **Stack implications:** Content storage, a routing/classification step, a frontend that can render multiple formats.

## A middle path worth discussing

Build Option A as the core end-to-end slice first (working within the first several days), then layer a lightweight chat/tutor element on top if time allows. This gets something demoable early and de-risks the rest of the timeline.

## Open question for the team

Whichever direction you pick, decide together whether "AI" for the demo means a genuinely integrated open-weight model call, or whether some parts can be simulated/rule-based for now with a model swapped in later — that decision affects both the tech stack doc and the environment setup doc in this repo.
