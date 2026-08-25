import type { Subject, UserProfile } from "./types";

export const initialSubjects: Subject[] = [
  {
    id: "dsa",
    name: "Data Structures & Algorithms",
    summary: "From arrays to graphs — build the intuition, not just the syntax.",
    building: "citadel",
    topics: [
      { id: "arrays-strings", name: "Arrays & Strings", state: "mastered", progressPct: 100 },
      { id: "trees", name: "Trees", state: "mastered", progressPct: 100 },
      { id: "graphs", name: "Graphs", state: "in-progress", progressPct: 55 },
      { id: "hashing", name: "Hashing", state: "locked", progressPct: 0 },
      { id: "dynamic-programming", name: "Dynamic Programming", state: "locked", progressPct: 0 },
    ],
  },
  {
    id: "calculus",
    name: "Calculus",
    summary: "Limits through series, grounded in why the rules work.",
    building: "observatory",
    topics: [
      { id: "limits", name: "Limits", state: "mastered", progressPct: 100 },
      { id: "derivatives", name: "Derivatives", state: "mastered", progressPct: 100 },
      { id: "integrals", name: "Integrals", state: "mastered", progressPct: 100 },
      { id: "series", name: "Series", state: "in-progress", progressPct: 80 },
    ],
  },
  {
    id: "linear-algebra",
    name: "Linear Algebra",
    summary: "Vectors, matrices, and the transformations behind them.",
    building: "crystal",
    topics: [
      { id: "vectors", name: "Vectors", state: "mastered", progressPct: 100 },
      { id: "matrices", name: "Matrices", state: "in-progress", progressPct: 30 },
      { id: "eigenvalues", name: "Eigenvalues", state: "locked", progressPct: 0 },
      { id: "determinants", name: "Determinants", state: "locked", progressPct: 0 },
    ],
  },
  {
    id: "orgo",
    name: "Organic Chemistry",
    summary: "Reaction mechanisms explained, not memorized.",
    building: "hextower",
    topics: [
      { id: "nomenclature", name: "Nomenclature", state: "in-progress", progressPct: 20 },
      { id: "reactions", name: "Reactions", state: "locked", progressPct: 0 },
      { id: "stereochemistry", name: "Stereochemistry", state: "locked", progressPct: 0 },
      { id: "spectroscopy", name: "Spectroscopy", state: "locked", progressPct: 0 },
    ],
  },
];

export const userProfile: UserProfile = {
  name: "Youssef",
  streakDays: 12,
  totalXp: 3420,
  week: [
    { label: "M", state: "done" },
    { label: "T", state: "done" },
    { label: "W", state: "done" },
    { label: "T", state: "done" },
    { label: "F", state: "today" },
    { label: "S", state: "upcoming" },
    { label: "S", state: "upcoming" },
  ],
};

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
