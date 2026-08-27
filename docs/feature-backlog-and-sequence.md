# Feature Backlog & Build Sequence (Consolidated)

This merges the team's own brainstorm (`extractedfeatures.pdf`) with the evidence-based list in `feature-extraction.md` into one prioritized, sequenced backlog. Treat this doc as the working plan going forward — the other two stay as reference (what the team came up with, and what evidence supports it).

## How priority was assigned

- **Tier 1 — non-negotiable / core loop.** Either named directly by instructors as a trust/adoption condition, or is the minimum needed for the adaptive loop to exist at all.
- **Tier 2 — important, follows the core loop.** Real value, evidenced, but the product works without it on day one.
- **Tier 3 — team hypothesis, not directly evidenced.** Worth being honest that these came from the team's own design thinking, not from something an instructor or student said in an interview. Not lesser ideas — just the first things to cut if the timeline is tight, and the last things to build if it isn't.

## Tier 1 — Core loop

1. **Diagnostic quiz** — initial assessment to seed a student's starting level per topic.
2. **RAG retrieval grounded in instructor-uploaded content**, with **citations on every answer** — non-negotiable per the interview data (instructors named this explicitly as a trust condition).
3. **Mastery check** — evaluate via "explain in your own words" + "solve an example end-to-end," not multiple-choice correctness. This is the most cross-validated insight from the interviews (instructors and students converged on it independently).
4. **Retry/re-explain in a different format** — start with two formats (e.g., a new worked example + a hands-on task) rather than all five the team listed (examples, visual aids, videos, extra resources, hands-on tasks). Add the rest in Tier 2 once the switching logic works with two.
5. **Short-term (session) memory** — the tutor needs to remember the current conversation to make the diagnostic → explain → retry → recheck loop coherent. This wasn't on either list explicitly but is required infrastructure for #3 and #4 to work as a loop rather than one-off exchanges.
6. **Basic learner profile** — current level and weak areas per topic, populated by the diagnostic and updated by mastery checks. (Preferences and long-term trend are Tier 2 — see below.)
7. **Instructor content upload** — the input side of #2.

## Tier 2 — Important, builds on the core loop

8. **Leading questions / scaffolded hints** for assignments and quizzes, with an attempt limit before revealing the answer or flagging the instructor. A specific, valuable mechanic from the team's list — sequence it after the core retry/re-explain loop (#4) since it's a variant of the same underlying "don't just give the answer" logic.
9. **"More depth" mode, bounded to curriculum content** — when a student wants to go deeper, the AI should be able to, but must stay grounded in what's actually been uploaded rather than drifting beyond it. This is a guardrail requirement layered on top of #2, not a separate feature.
10. **Full learner profile richness** — preferences (favorite explanation format), prior courses, weak-area trend over time. The basic version (#6) is enough to demo the loop; this is what makes personalization compound across sessions.
11. **Instructor insights dashboard** — per-student patterns, non-boring method suggestions, teaching ideas. Valuable augmentation (matches Cluster F: instructors want help, not replacement) but not required for the core student-facing loop to work.
12. **Validation/evaluation reporting** — some visible evidence of answer accuracy to show instructors. A lightweight version (a benchmark report you can show, not a live in-product feature) is enough for a demo; a full "prospective study" standard, per one instructor's answer, is out of scope for this timeline.
13. **Remaining retry formats** — visual aids, videos, extra resources, once #4's two-format version is proven to work.

## Tier 3 — Team hypothesis, cut first if time is tight

14. **Gamification** — Duolingo-style progress bar, student avatar/profile visuals. Worth naming plainly: no instructor or student in either interview round asked for this. It may still be worth building for polish and engagement, but it competes for the same time as Tier 1/2 items that are directly evidenced — I'd build it last, and only if the core loop is solid first.
15. **Long-term / cross-course memory** — "connecting previous and current courses" is a genuinely hard feature (it implies persistent history across terms, not just a session) and wasn't named by interviewees either. A simplified version — persisting the Tier 1/2 profile fields across sessions — gets most of the practical value without the full complexity; save true cross-course reasoning for later.

## Suggested sequence (maps onto `build-sequence.md`'s phases and tracks)

**Phase 1 (walking skeleton):** #7 upload → #2 RAG + citations → #1 diagnostic quiz → #6 basic profile. Proves the foundational pipeline end-to-end, per the earlier build-sequence doc.

**Phase 2 (close the adaptive loop):** #5 session memory → #3 mastery check → #4 retry/re-explain (two formats). This is the actual "adaptive learning" behavior the HMW is about — the point where the demo starts to feel like the real concept rather than a content viewer.

**Phase 3 (depth and scaffolding):** #8 leading questions/hints → #9 bounded depth mode → #13 remaining retry formats.

**Phase 4 (richness and instructor side):** #10 full profile → #11 instructor dashboard → #12 evaluation reporting.

**Phase 5 (stretch, time-permitting only):** #14 gamification → #15 long-term memory.

### Track ownership (per `build-sequence.md`'s 5 tracks)

- **Backend/Infra:** #7, #6/#10 (profile storage), #5 (session state), auth from the earlier plan.
- **AI/RAG:** #2, #9 (bounding depth to retrieved content), #12.
- **AI/Pacing + guardrails:** #1, #3, #4, #8, #13.
- **Frontend:** UI for all of the above, roughly in the same phase order; #14 is entirely this track's when its turn comes.
- **PM/Data/Privacy:** keeps this backlog honest — traces each Tier 1/2 item back to its evidence (already done above), flags anything that drifts into Tier-3-style hypothesis without being labeled as such, and owns the profile privacy/retention questions for #6/#10.

## One thing worth deciding as a team before Phase 1 starts

This backlog assumes the team is comfortable building Tier 1 fully before touching Tier 2, even under time pressure — i.e., resisting the pull to build the gamified progress bar because it's fun before the mastery check (which is unglamorous but is what the actual evidence says matters) is solid. Worth saying out loud as a team norm, since it's an easy discipline to lose once multiple people are building in parallel.
