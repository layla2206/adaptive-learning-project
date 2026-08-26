// Marketing placeholder copy for the public home page only — aspirational,
// not user data, so it's exempt from the "no mock data" rule that applies
// to everything behind login (dashboard, score, milestones, instructor
// stats). Real per-account data is fetched via TutorStoreProvider (see
// src/lib/store.tsx) and the /api/student, /api/instructor, /api/admin
// dashboard routes.
export const homeStats = [
  { value: "12,400+", label: "Diagnostics Run" },
  { value: "94%", label: "Mastery Rate" },
  { value: "3.2×", label: "Faster Recall" },
  { value: "40+", label: "Subjects Covered" },
];

export const homeSteps = [
  {
    n: "01",
    title: "Diagnose",
    desc: "A short, targeted probe finds exactly where your understanding breaks down — not a generic pretest.",
  },
  {
    n: "02",
    title: "Explain",
    desc: "You get an explanation grounded in real sources, cited inline, aimed squarely at the gap the diagnostic found.",
  },
  {
    n: "03",
    title: "Check",
    desc: "A free-response mastery check — no multiple choice to guess through. You either show the reasoning or you don't.",
  },
  {
    n: "04",
    title: "Retry",
    desc: "If it didn't land, the explanation comes back in a different format — worked example, analogy, diagram — and you try again.",
  },
];

export const homeFeatures = [
  {
    title: "Grounded Explanations",
    desc: "Every explanation is cited against real source material — no confident hallucinations standing in for teaching.",
    featured: true,
  },
  {
    title: "Diagnostic-First",
    desc: "We find the specific gap before we explain anything, so you're never re-taught what you already know.",
  },
  {
    title: "Free-Response Checks",
    desc: "Mastery is proven by producing the answer, not recognizing it in a list of four options.",
  },
  {
    title: "Alternate-Format Retries",
    desc: "A missed check triggers a different explanation style, not the same paragraph shown twice.",
  },
  {
    title: "Progress You Can See",
    desc: "Every topic tracks locked, in-progress, and mastered state so you always know what's next.",
  },
  {
    title: "Built for Depth",
    desc: "Fewer topics, actually mastered — not a wide syllabus skimmed once and forgotten.",
  },
];

export const testimonial = {
  quote:
    "It didn't re-explain what I already understood. It found the one step in the proof I was fuzzy on, explained that, and checked I could actually reproduce it.",
  name: "Priya N.",
  role: "Second-year CS student",
};
