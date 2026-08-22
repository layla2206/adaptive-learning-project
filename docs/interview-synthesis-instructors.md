# Empathize Synthesis — Instructor Responses (Round 1)

**Source:** 7 instructor form responses (`Untitled form.csv`), collected 2026-08-21 to 2026-08-22. Respondents: Amr Osama, George Welson, Jwanda William, Karim Bassel, Rimoun Ramsis Boutrus, one anonymous respondent, and Mary Gerges.

**A caution before the themes below:** this is 7 self-selected respondents answering a form, not a representative sample of university instructors generally, and I don't know what institution(s) or subjects they teach beyond what's in their answers (programming, math are mentioned explicitly; others aren't specified). Treat what follows as directional qualitative signal for your team's own thinking, not as proof or as something to cite as generalizable in front of judges without that caveat. This round is also instructor-only — the student-side interviews from the original guide still haven't happened, and student voice is the other half of the empathize picture.

## Theme 1 — Class size and time, not skill or willingness, is the real bottleneck

Every single respondent named scale/time as the core obstacle to individual attention, independent of subject or teaching style:

- Amr: "when there are 50+ students in class"
- George: "the large number of students to deal with in a short period of time"
- Jwanda: "Managing the lesson content, answering questions, and making sure the whole class is progressing at the same time"
- Karim: "Huge number of students makes it difficult, and if the tutorial content is rich, no time for individual attention for every student"
- Rimoun: "Number of students. Limited time."
- Anonymous: "Time"
- Mary: "Too many students, not enough assistants, large content"

**Insight:** Instructors are not failing to individualize because they don't want to or don't know how — nearly every respondent describes exactly the kind of adaptive teaching they'd like to do (see Theme 2) but can't sustain it at class scale. This is strong, near-unanimous (7/7) support for the "stretched instructors" pain point already on slide 3 — worth pulling 2–3 of these quotes directly into that slide as evidence rather than leaving it purely qualitative-assertion.

## Theme 2 — Struggle detection today is behavioral and reactive, not data-driven

Instructors currently rely on reading the room, not on any system:

- George gave the richest account: seating-position patterns, "squinting," "brushing their chins," a student "suddenly checking their phone to fact check something" — and explicitly reacts by slowing down or repeating.
- Jwanda distrusts self-report: tests understanding by asking students to apply a concept to "a slightly different example" rather than relying on whether they say they understand.
- Karim and Mary both point to disengagement cues: "loses concentration," "non-engaged, distracted."
- Rimoun's answer is the sharpest limitation: **"If they don't ask, and I don't ask them, I wouldn't know."**

**Insight:** the detection method instructors currently use is real-time, in-room, visual/behavioral — something a purely digital tool can't literally replicate. Rimoun's quote is the important one for your problem framing: it names a silent-struggler risk (a student who neither asks nor gets asked falls through) that doesn't depend on instructor effort at all, and is exactly the gap a proactive, signal-based system (time-on-task, retry patterns, hint requests) could address instead of visual cues. This is useful, concrete input for the data-strategy conversation — it tells you which behavioral proxies (not classroom body language, but digital equivalents of it) are worth logging.

## Theme 3 — "Mastery" means transfer and initiative, not a correct answer

Several respondents explicitly reject surface correctness as proof of understanding:

- George: real mastery starts when a student "starts asking questions to see the whole picture."
- Jwanda: checks whether a student "can explain the concept in their own words and apply it to a new problem **without simply following a memorized example**."
- Karim: mastery shows up as going beyond the syllabus — "starts studying more advanced topics further than the course content, starts doing a personal project."
- Rimoun and Mary, by contrast, point to more conventional grades/quizzes as their signal.

**Insight:** there's a real split here — some instructors (George, Jwanda, Karim) want mastery assessed through transfer/application/initiative, while others (Rimoun, Mary) are comfortable with grades/quizzes as a proxy. If your MVP's "understanding level" signal is based only on quiz correctness, at least some of these instructors would consider that an incomplete measure of mastery — worth deciding deliberately whether your first version accepts that limitation or tries to test application.

## Theme 4 — Personalization needs background and trajectory, not a single grade

- Jwanda was the most explicit: wants "current level of understanding, previous performance, areas of strength and weakness, preferred way of learning" and **progress over time rather than looking only at final grades.**
- George and Karim both mention prior coursework/background as the key personalizing signal.
- Rimoun: educational background specifically.

**Insight:** directly useful for the data-strategy doc — instructors are describing a longitudinal per-student profile (history + trajectory), not a single test score. That's a heavier data model than "one quiz result," and worth flagging as a scope decision for the MVP (a full history is probably out of reach in 1–2 weeks; a single-session diagnostic is a deliberate simplification, not the end state).

## Theme 5 — What instructors actually want automated is admin work, not teaching judgment

- Amr: "grading, analytics, plans, cheating in HW"
- Jwanda: wants help to "quickly identify students' strengths and weaknesses and track their progress" and a tool that can "suggest different explanations, exercises, or difficulty levels for individual students" — this lines up closely with your actual product concept.
- Karim: "Automate every repetitive task I do, only do and invest effort in what matters."
- Mary: "Preparing content and exams, ideas of more engaging teaching plans."
- (One response, George's "prettifying my handwriting on the board," reads as a lighter/possibly not fully serious answer — noting it for completeness rather than treating it as a design requirement.)

**Insight:** this is good, quotable material for slide 4's "freed instructor capacity" claim — instructors are independently describing time relief from repetitive work as the value they want, which is exactly the qualitative business-value argument already being made, now with supporting voice.

## Theme 6 — Trust in AI is conditional and, in one case, flatly withheld

This is the theme most worth taking seriously and not smoothing over:

- Amr: trust depends on "accuracy."
- George: trust follows from "evaluation results" (quiz/assignment performance over time).
- Karim: expects hallucination as a given, and frames safe use as requiring the student to already have enough baseline knowledge to catch errors themselves.
- Rimoun: wants validation "in a prospective randomized study" before trusting it — the highest evidentiary bar in the set, phrased in clinical-trial language.
- Anonymous: trust requires the tool to give references when asked.
- Mary: "I will test it first."
- **Jwanda: "Don't trust."** No qualification given.

**Insight:** trust is earned, not assumed, and the bar varies a lot — from "show me references" to "prove it in a controlled study." One respondent rejects AI tutoring outright. For the deck and for the product itself, this argues for building in transparency/verifiability (sources, confidence, ability to test before adopting) as a real design requirement, and for being honest in the pitch that instructor adoption is not guaranteed — some will need to see evidence before trusting it with their students, and at least one respondent in this small sample won't trust it regardless.

## How this feeds back into the deck and the four blockers

- **Slides 3–4:** Themes 1 and 5 give you real instructor quotes to ground the "stretched instructors" and "freed instructor capacity" claims — worth swapping in 2–3 direct quotes rather than leaving those slides purely assertion-based.
- **Slide 6, "Data":** Theme 4 gives a concrete (if heavier-than-MVP) answer to what a personalization data model should eventually include; Theme 2 suggests which behavioral proxies to log even at MVP scale.
- **Slide 6, "People":** Theme 6 is the most important input here — instructor trust/adoption is a real, uneven barrier, not a formality. Worth reflecting honestly rather than scoring "People" more favorably than this data supports.
- **Slide 6, "AI Model" and "Platform":** this round doesn't move these much — they're still genuinely blocked on your team's own architecture/infra decisions, not something instructor interviews can resolve.

## What's still missing

This is instructor perspective only. The original interview guide's student-side questions haven't been run yet — student stories about pace and feedback are the other half of this picture, and some of what instructors assume about students here (e.g., who's "struggling" vs. "uninterested") is worth checking against what students actually say about their own experience.
