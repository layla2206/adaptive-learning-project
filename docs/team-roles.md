# Team Role Division — Proposal

A starting point for splitting a 5-person team across a 1–2 week build. Adjust freely once the MVP direction is picked — this is meant to be a discussion draft, not an assignment.

## Proposed split

**Frontend/UI (1 person).** Builds the student-facing interface (quiz screen, chat window, or content viewer depending on the MVP direction picked). Owns the demo's look and feel.

**Backend/API (1 person).** Owns the FastAPI (or Streamlit app logic) service — request handling, connecting frontend to the AI layer, data storage.

**AI/prompting (1 person).** Owns the model integration: choosing/testing the open-weight model or free-tier provider, writing and iterating on prompts, handling the "adjust pace/depth" logic. This role should start testing model reliability in week 1 since it's the highest-risk piece (see the tech stack doc).

**Data/content (1 person).** Owns whatever content the demo needs — quiz questions and answer keys, sample topics, or the small curated content set (if Option C). Also owns the data schema (what a "student profile" or "understanding level" actually looks like).

**Synthesis/PM + deck (1 person).** Keeps the interview synthesis (empathy maps, insight statements) connected to what's being built, updates the deck (slides 2–6, especially unblocking the slide 6 scoring criteria as real decisions land), and tracks scope so the team doesn't overrun the 1–2 week window.

## Notes

- With 5 people this will overlap in practice — pairing (e.g. frontend + backend working together on the first end-to-end slice) is normal and often faster than strict silos, especially in week 1.
- The AI/prompting role and the synthesis/PM role both feed directly into slide 6: AI/prompting can help move "AI Model" and part of "Data" from Blocked/Partial toward Scoreable once there's a real answer; synthesis/PM should keep that slide updated as decisions land rather than leaving it stale.
- If the team ends up choosing Option B (chat) or a chat layer gets added later, consider having two people on AI/prompting temporarily since that's the highest-effort, highest-risk piece per the comparison doc.
