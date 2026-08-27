# Feature Extraction — from Empathize Synthesis (Instructor + Student, Round 2)

Source: `Interview synthesis observations and insights.pdf` (9 instructor + 9 student responses, clusters A–N plus cross-cutting insights). Every feature below is traced to a specific cluster so it stays checkable against evidence rather than becoming a wish list.

**Sampling caveat, carried over from the source doc itself:** this sample skews toward one Egyptian university's engineering/CS and medical faculty and undergrads. Treat this feature list as strong direction for a prototype aimed at that same population — not as proof it generalizes to university students broadly. The source doc already flags this as a team decision (scope narrow vs. broaden); nothing below resolves that for you.

## Must-have, trust-blocking features (instructors named these as literal adoption conditions)

1. **Source citations on every answer.** The tutor should show which passage of the uploaded content it drew from. This isn't a nice-to-have — Cluster G shows instructors naming "references" and "fact-checking" as explicit trust conditions, and the cross-cutting insight names a real trust gap between students (who already trust AI enough to use it daily) and instructors (who won't without evidence). Skipping this reproduces the #1 named adoption blocker.
2. **Hallucination handling / confidence signaling.** When retrieval doesn't find a relevant passage, the tutor should say so rather than guess — Karim's answer explicitly names hallucination as expected, and frames safe use as depending on the system (or the student) being able to catch it.
3. **A visible accuracy/evaluation story.** Rimoun's bar ("validated in a prospective randomized study") is a clinical-research standard, out of reach for an internship demo — but the underlying need (some evidence the tool's answers have been checked, not just asserted) is real and can be partially met with a lightweight evaluation you can show instructors, even if it's not a formal study.

## Core adaptive features (independently validated by both instructors and students — the strongest evidence in the doc)

4. **Explain-and-apply mastery check.** Cluster D (instructors: "explain in their own words and apply it to a new problem, not a memorized example") and Cluster J (students: same standard, arrived at independently) converge on the same definition of real understanding. This is the strongest, most cross-validated insight in the whole synthesis — worth making this the actual thing the AI assesses, rather than defaulting to multiple-choice correctness.
5. **Individual pacing, both directions.** Cluster C shows current "adaptation" is really one recalibration for a felt class average; Cluster K shows the mismatch runs both ways even in a 9-person sample (some students want it faster, at least one wants it slower). The pacing engine needs to support accelerating advanced students, not just remediating strugglers.
6. **Re-explain in a different format, not slower.** Cluster L is specific: the "click" moment named by students was almost always a different representation (a visual, a peer's phrasing, a real-world hook) — never the same explanation repeated more slowly. This is direct evidence for the "format" half of your HMW, and arguably deserves equal product investment to the pacing engine (the cross-cutting insight says this explicitly).
7. **Practice attached to every explanation.** Cluster N: students want explanation paired with a hands-on task, not more theory or an alternate way to read/watch the same content. Suggests every re-explanation should come with an immediate small exercise, not stand alone.

## Features addressing the "silent struggler" gap

8. **Passive signal capture as a proxy for classroom cues.** Cluster A: instructors detect struggle entirely through nonverbal, in-room observation (squinting, phone-checking, seating patterns) that a digital tool can't literally see. The design implication is to capture digital proxies instead — time-on-task, retries, hint requests — as the equivalent signal, not to try to replicate visual observation.
9. **Low-friction, low-stakes confusion flagging.** Clusters I and M: the barrier to asking for help is emotional (embarrassment, "faking it") rather than logistical, and students paper over gaps under time pressure rather than closing them. Whatever the "I'm stuck" action is, it needs to cost less than the social cost of admitting confusion — a single low-visibility tap, not a form.
10. **Private-by-default help-seeking.** Cluster H and I together: students already default to AI/YouTube over asking a human, partly because it's private. Keeping a student's help activity from being visible to instructors/peers by default preserves the exact thing that makes AI help-seeking lower-friction than office hours.

## Instructor-facing features

11. **Per-student pattern dashboard**, not just a gradebook — background, current level, weak areas, and trend over time. Cluster E: instructors independently named nearly this exact field list when asked what would help them personalize.
12. **Suggested interventions for instructor review, not autonomous teaching.** Cluster F is explicit that instructors want augmentation ("automate every repetitive task," "suggest different explanations, exercises, or difficulty levels") — framed as assistance, not replacement. Worth keeping the instructor in the loop on what the AI suggests rather than having it act unilaterally.
13. **Early compounding-gap flagging.** The cross-cutting insight ties instructors' structural claim (gaps compound over a course) to students' own mechanism (procrastination + faking understanding) — together they support a feature that surfaces a worsening trend to an instructor before it reaches exam time, using the same behavioral signals as #8.

## Data / profile features

14. **Learner profile schema**, populated from what instructors already named wanting: background/prior courses, current per-topic level, weak areas, and learning-style/preference (Cluster E). This is a usable first draft for the schema question raised earlier, not something to design from scratch.

## What this changes about earlier planning

- **RAG's job just got more specific.** It's not just "reduce hallucination" in the abstract — Cluster G makes the actual requirement concrete: every answer should be traceable to a specific source passage. That's a citation/attribution feature on top of retrieval, not just retrieval itself.
- **The "AI scoring matrix" ambiguity from `implementation-plan.md` has a likely answer.** Cluster G lists explicit, testable trust conditions (cite sources, show accuracy, avoid hallucination) — that reads as the material for an evaluation rubric for judging the tutor's output quality (interpretation "b" from that doc), not the slide 5 prioritization matrix. Worth the team confirming, but this data points that direction.

## Suggested next step

Feed this list into a feature backlog against the slide 5/6 prioritization work. I'd treat items 1–2 (citations, hallucination handling) as non-negotiable for the MVP regardless of how the rest of the scope shakes out — the data says skipping them reproduces the exact adoption blocker instructors named.
