"use client";

import React, { useState, useEffect, useCallback, useRef, type ReactNode, type Dispatch, type SetStateAction } from "react";
import {
  Sprout, BookOpen, Mic, Users, TrendingUp, Wifi, WifiOff, Home,
  GraduationCap, Network, Volume2, ChevronRight,
  Globe2, CloudOff, RefreshCw, Upload,
  Brain, Target, Heart, ArrowRight, Play, Check, AlertTriangle,
  Layers, Radio, Languages, User, X,
  ClipboardList, CheckCircle2, Circle, BookMarked, Trophy, Calculator,
  type LucideIcon
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip
} from "recharts";
import { useOfflineSync, type OfflineSync } from "../hooks/useOfflineSync";
import { lessonsApi, quizzesApi, classroomsApi, parentApi, voiceApi, authApi, setToken, getToken, ApiError, type GenerateLessonResponse } from "../lib/api";
import { speak, isSpeechSynthesisAvailable, startRecording } from "../lib/voice";

/* ------------------------------------------------------------------ */
/*  DESIGN TOKENS — "Chalkboard & Marigold"                            */
/*  Deep classroom chalkboard green, whitewashed-wall cream, marigold  */
/*  (turmeric/festival) accent, clay red, indigo for data/tech layer.  */
/* ------------------------------------------------------------------ */
const T = {
  bg: "#132922",
  bgSoft: "#1B382F",
  panel: "rgba(246,240,228,0.05)",
  panelBorder: "rgba(246,240,228,0.10)",
  cream: "#F6F0E4",
  chalk: "#D8D2C2",
  marigold: "#E8A93A",
  marigoldSoft: "#F2C874",
  clay: "#C1652F",
  indigo: "#5C7FB5",
  green2: "#7FA893",
  danger: "#D9705C",
};

const fontFace = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
`;

/* ------------------------------------------------------------------ */
/*  SHARED TYPES                                                       */
/* ------------------------------------------------------------------ */
type Student = {
  id: number;
  name: string;
  grade: number;
  lang: string;
  mastery: number;
  streak: number;
  twin: number[];
  avatarColor: string;
};

type Agent = {
  name: string;
  icon: LucideIcon;
  role: string;
  color: string;
};

type ViewId = "overview" | "teacher" | "student" | "agents" | "live";
type PillTone = "default" | "live" | "warn" | "gold";
// Only the three languages actually needed by these classrooms.
type LangKey = "Kannada" | "Hindi" | "English";

function langKeyToCode(lang: LangKey): "kn" | "hi" | "en" {
  return lang === "Kannada" ? "kn" : lang === "Hindi" ? "hi" : "en";
}

/* ---- Study material & homework -------------------------------------- */
type SubjectId = "maths" | "science" | "english" | "kannada" | "evs";

type SubjectDef = { id: SubjectId; name: string; icon: LucideIcon; color: string };

type StudyMaterial = {
  id: string;
  subjectId: SubjectId;
  grade: number;
  title: string;
  content: Record<LangKey, string>;
  uploadedBy: string; // "Teacher" or "GURU AI (seed content)"
};

type Homework = {
  id: string;
  subjectId: SubjectId;
  grade: number | "all";
  title: string;
  instructions: string;
  dueDate: string; // ISO date
  totalQuestions: number;
  topics: string[]; // key concepts, used to explain mistakes
  createdAt: string;
};

type HomeworkMistake = { topic: string; note: string };

// Deliberately a plain module-level function, not defined inside a component
// body: it calls Math.random(), which React's render-purity lint rule flags
// if it's reachable from a component's render path, even when (as here)
// it's only ever invoked from an onClick handler, not during render.
function simulateHomeworkGrading(hw: Homework): { correctCount: number; mistakes: HomeworkMistake[]; submissionId: string } {
  const wrongCount = Math.floor(Math.random() * Math.min(3, hw.totalQuestions));
  const correctCount = hw.totalQuestions - wrongCount;
  const shuffledTopics = [...hw.topics].sort(() => Math.random() - 0.5);
  const mistakes: HomeworkMistake[] = shuffledTopics.slice(0, wrongCount).map(topic => ({
    topic,
    note: "Answer didn't match this concept — GURU will re-explain it with a simpler example.",
  }));
  return { correctCount, mistakes, submissionId: `sub-${Date.now()}` };
}

type HomeworkSubmission = {
  id: string;
  homeworkId: string;
  studentId: number;
  correctCount: number;
  totalQuestions: number;
  mistakes: HomeworkMistake[];
  completedAt: string;
};

/* ------------------------------------------------------------------ */
/*  MOCK DATA                                                          */
/* ------------------------------------------------------------------ */
const students: Student[] = [
  { id: 1, name: "Chandrika", grade: 2, lang: "Kannada", mastery: 78, streak: 6, twin: [80, 65, 70, 90, 55], avatarColor: T.marigold },
  { id: 2, name: "Vinay", grade: 4, lang: "Kannada", mastery: 54, streak: 2, twin: [40, 60, 30, 55, 70], avatarColor: T.clay },
  { id: 3, name: "Fatima", grade: 3, lang: "Hindi", mastery: 88, streak: 12, twin: [90, 85, 95, 80, 88], avatarColor: T.green2 },
  { id: 4, name: "Manju", grade: 1, lang: "Kannada", mastery: 41, streak: 1, twin: [30, 45, 20, 50, 60], avatarColor: T.indigo },
  { id: 5, name: "Ashwini", grade: 5, lang: "English", mastery: 92, streak: 18, twin: [95, 90, 88, 94, 96], avatarColor: T.marigoldSoft },
  { id: 6, name: "Prakash", grade: 2, lang: "Kannada", mastery: 33, streak: 0, twin: [25, 40, 20, 35, 45], avatarColor: T.danger },
];

const weeklyClassHealth = [
  { day: "Mon", score: 62 }, { day: "Tue", score: 66 }, { day: "Wed", score: 71 },
  { day: "Thu", score: 68 }, { day: "Fri", score: 75 }, { day: "Sat", score: 79 },
];

const weakConcepts = [
  { concept: "Fractions – Grade 4", affected: 14, root: "Division remainder concept (Grade 3)" },
  { concept: "Kannada Conjuncts (ಒತ್ತಕ್ಷರ)", affected: 9, root: "Vowel-sign recognition (Grade 2)" },
  { concept: "Simple Sentences – English", affected: 11, root: "Vocabulary retention gap" },
];

const radarData = [
  { subject: "Reading", A: 78 }, { subject: "Math", A: 54 },
  { subject: "Science", A: 66 }, { subject: "Language", A: 88 },
  { subject: "Attention", A: 61 },
];

const agents: Agent[] = [
  { name: "Orchestrator Agent", icon: Network, role: "Routes every request to the right specialist agent and merges their outputs into one coherent response.", color: T.marigold },
  { name: "Lesson Agent", icon: BookOpen, role: "Turns uploaded textbook pages, photos or notes into grade-wise lesson content for Grades 1–5 at once.", color: T.green2 },
  { name: "Language Agent", icon: Languages, role: "Translates and localises every lesson into Kannada, Hindi and English, preserving meaning.", color: T.indigo },
  { name: "Voice Agent", icon: Mic, role: "Converts text to natural spoken explanations and transcribes student questions asked aloud.", color: T.clay },
  { name: "Quiz Agent", icon: Target, role: "Builds adaptive quizzes that get easier or harder based on a student's live performance.", color: T.marigoldSoft },
  { name: "Progress Agent", icon: TrendingUp, role: "Tracks mastery per concept per student and feeds the Digital Twin memory.", color: T.green2 },
  { name: "Planner Agent", icon: Layers, role: "Predicts tomorrow's lesson plan from today's class-wide performance data.", color: T.indigo },
  { name: "Peer Learning Agent", icon: Users, role: "Pairs stronger and weaker students on matching concepts for buddy learning.", color: T.marigold },
  { name: "Community Knowledge Agent", icon: Sprout, role: "Replaces generic textbook examples with local village context — crops, markets, festivals.", color: T.clay },
  { name: "Offline Sync Agent", icon: CloudOff, role: "Queues all activity on-device and syncs silently the moment connectivity returns.", color: T.danger },
  { name: "Parent Communication Agent", icon: Heart, role: "Converts progress data into short voice messages parents can understand, in their language.", color: T.marigoldSoft },
];

const villageExamples = [
  { generic: "A train travels 60 km in 1 hour...", local: "The APMC vegetable truck travels 60 km from Chintamani to the Kolar market in 1 hour..." },
  { generic: "A rectangular garden has length 5m...", local: "Manju's family's ragi field is shaped like a rectangle, 5m along the bund..." },
];

/* ------------------------------------------------------------------ */
/*  SUBJECTS, STUDY MATERIAL & HOMEWORK — shared between Teacher and    */
/*  Student views so a teacher's upload/homework shows up instantly    */
/*  in every matching student's profile.                                */
/* ------------------------------------------------------------------ */
const SUBJECTS: SubjectDef[] = [
  { id: "maths", name: "Mathematics", icon: Calculator, color: T.indigo },
  { id: "science", name: "Science", icon: Sprout, color: T.green2 },
  { id: "english", name: "English", icon: BookOpen, color: T.marigold },
  { id: "kannada", name: "Kannada", icon: Languages, color: T.clay },
  { id: "evs", name: "Social Studies", icon: Globe2, color: T.marigoldSoft },
];

// A lightweight stand-in for the Language Agent, used only for material a
// teacher adds live in this demo. Seed material below is hand-translated.
function pseudoTranslate(text: string, lang: LangKey): string {
  if (lang === "English") return text;
  const tag = lang === "Kannada" ? "ಕನ್ನಡ" : "हिंदी";
  return `[${tag} — ಸ್ವಯಂಚಾಲಿತ ಅನುವಾದ / auto-translated by Language Agent]\n${text}`;
}

const INITIAL_MATERIALS: StudyMaterial[] = [
  {
    id: "m-maths-1", subjectId: "maths", grade: 4, title: "Understanding Fractions",
    uploadedBy: "GURU AI (seed content)",
    content: {
      English: "A fraction shows a part of a whole. If 4 mangoes are shared equally between 2 friends, each friend gets 4 ÷ 2 = 2 mangoes. We write parts as numerator/denominator, e.g. 1/2 means one of two equal parts.",
      Kannada: "ಭಿನ್ನರಾಶಿ ಎಂದರೆ ಒಟ್ಟಿನ ಒಂದು ಭಾಗ. 4 ಮಾವಿನ ಹಣ್ಣುಗಳನ್ನು 2 ಸ್ನೇಹಿತರ ನಡುವೆ ಸಮನಾಗಿ ಹಂಚಿದರೆ, ತಲಾ 4 ÷ 2 = 2 ಹಣ್ಣುಗಳು ಸಿಗುತ್ತವೆ. ಭಾಗಗಳನ್ನು ಅಂಶ/ಛೇದ ಎಂದು ಬರೆಯುತ್ತೇವೆ, ಉದಾ: 1/2 ಎಂದರೆ ಎರಡು ಸಮಾನ ಭಾಗಗಳಲ್ಲಿ ಒಂದು.",
      Hindi: "भिन्न किसी पूरी वस्तु के एक भाग को दर्शाता है। यदि 4 आमों को 2 दोस्तों के बीच बराबर बांटा जाए, तो हर एक को 4 ÷ 2 = 2 आम मिलेंगे। भागों को अंश/हर के रूप में लिखा जाता है, जैसे 1/2 का अर्थ है दो बराबर भागों में से एक।",
    },
  },
  {
    id: "m-science-1", subjectId: "science", grade: 3, title: "Parts of a Plant",
    uploadedBy: "GURU AI (seed content)",
    content: {
      English: "Every plant has roots, a stem, leaves, and often flowers. Roots hold the plant in the soil and absorb water. The stem carries water up to the leaves. Leaves use sunlight to make food for the plant.",
      Kannada: "ಪ್ರತಿಯೊಂದು ಸಸ್ಯಕ್ಕೆ ಬೇರುಗಳು, ಕಾಂಡ, ಎಲೆಗಳು ಮತ್ತು ಹೆಚ್ಚಾಗಿ ಹೂವುಗಳು ಇರುತ್ತವೆ. ಬೇರುಗಳು ಸಸ್ಯವನ್ನು ಮಣ್ಣಿನಲ್ಲಿ ಹಿಡಿದಿಟ್ಟುಕೊಂಡು ನೀರನ್ನು ಹೀರುತ್ತವೆ. ಕಾಂಡವು ನೀರನ್ನು ಎಲೆಗಳಿಗೆ ಸಾಗಿಸುತ್ತದೆ. ಎಲೆಗಳು ಸೂರ್ಯನ ಬೆಳಕನ್ನು ಬಳಸಿ ಆಹಾರ ತಯಾರಿಸುತ್ತವೆ.",
      Hindi: "हर पौधे में जड़ें, तना, पत्तियाँ और अक्सर फूल होते हैं। जड़ें पौधे को मिट्टी में पकड़े रखती हैं और पानी सोखती हैं। तना पानी को पत्तियों तक पहुंचाता है। पत्तियाँ सूर्य के प्रकाश से पौधे के लिए भोजन बनाती हैं।",
    },
  },
  {
    id: "m-english-1", subjectId: "english", grade: 3, title: "Simple Sentences",
    uploadedBy: "GURU AI (seed content)",
    content: {
      English: "A simple sentence has a subject and a verb, and expresses one complete idea. Example: 'The cow eats grass.' Subject = The cow, Verb = eats.",
      Kannada: "ಸರಳ ವಾಕ್ಯದಲ್ಲಿ ಕರ್ತೃ ಮತ್ತು ಕ್ರಿಯಾಪದ ಇರುತ್ತದೆ, ಮತ್ತು ಒಂದು ಪೂರ್ಣ ಆಲೋಚನೆಯನ್ನು ವ್ಯಕ್ತಪಡಿಸುತ್ತದೆ. ಉದಾಹರಣೆ: 'ಹಸು ಹುಲ್ಲು ತಿನ್ನುತ್ತದೆ.' ಕರ್ತೃ = ಹಸು, ಕ್ರಿಯಾಪದ = ತಿನ್ನುತ್ತದೆ.",
      Hindi: "एक सरल वाक्य में कर्ता और क्रिया होती है, और यह एक पूरा विचार व्यक्त करता है। उदाहरण: 'गाय घास खाती है।' कर्ता = गाय, क्रिया = खाती है।",
    },
  },
  {
    id: "m-kannada-1", subjectId: "kannada", grade: 2, title: "ಒತ್ತಕ್ಷರ (Conjunct Letters)",
    uploadedBy: "GURU AI (seed content)",
    content: {
      English: "A conjunct letter (ಒತ್ತಕ್ಷರ) is formed when two consonants join without a vowel between them, shown as a smaller letter attached below the main letter — for example ಕ + ್ + ತ = ಕ್ತ.",
      Kannada: "ಒತ್ತಕ್ಷರವು ಎರಡು ವ್ಯಂಜನಗಳು ನಡುವೆ ಸ್ವರವಿಲ್ಲದೆ ಸೇರಿದಾಗ ಉಂಟಾಗುತ್ತದೆ, ಇದನ್ನು ಮುಖ್ಯ ಅಕ್ಷರದ ಕೆಳಗೆ ಚಿಕ್ಕ ಅಕ್ಷರವಾಗಿ ತೋರಿಸಲಾಗುತ್ತದೆ — ಉದಾಹರಣೆಗೆ ಕ + ್ + ತ = ಕ್ತ.",
      Hindi: "ಒತ್ತಕ್ಷರ (संयुक्त अक्षर) तब बनता है जब दो व्यंजन बिना स्वर के आपस में जुड़ते हैं, जिसे मुख्य अक्षर के नीचे एक छोटे अक्षर के रूप में दिखाया जाता है — जैसे ಕ + ್ + ತ = ಕ್ತ.",
    },
  },
  {
    id: "m-evs-1", subjectId: "evs", grade: 4, title: "Our Local Government",
    uploadedBy: "GURU AI (seed content)",
    content: {
      English: "A Gram Panchayat looks after a village — roads, water supply, and cleanliness. Members are elected by the villagers every five years, and the Sarpanch leads the panchayat.",
      Kannada: "ಗ್ರಾಮ ಪಂಚಾಯತ್ ಒಂದು ಗ್ರಾಮದ ರಸ್ತೆಗಳು, ನೀರು ಸರಬರಾಜು ಮತ್ತು ಸ್ವಚ್ಛತೆಯನ್ನು ನೋಡಿಕೊಳ್ಳುತ್ತದೆ. ಸದಸ್ಯರನ್ನು ಪ್ರತಿ ಐದು ವರ್ಷಗಳಿಗೊಮ್ಮೆ ಗ್ರಾಮಸ್ಥರು ಆಯ್ಕೆ ಮಾಡುತ್ತಾರೆ, ಮತ್ತು ಸರಪಂಚ್ ಪಂಚಾಯತ್ ಅನ್ನು ಮುನ್ನಡೆಸುತ್ತಾರೆ.",
      Hindi: "ग्राम पंचायत गांव की सड़कों, जल आपूर्ति और स्वच्छता की देखभाल करती है। सदस्यों को हर पांच साल में गांव वाले चुनते हैं, और सरपंच पंचायत का नेतृत्व करता है।",
    },
  },
];

const INITIAL_HOMEWORK: Homework[] = [
  {
    id: "hw-1", subjectId: "maths", grade: 4, title: "Fraction sharing practice",
    instructions: "Solve 5 word problems on sharing objects equally as fractions.",
    dueDate: "2026-07-08", totalQuestions: 5,
    topics: ["Division remainder concept", "Numerator vs denominator", "Equal sharing word problems"],
    createdAt: "2026-07-02",
  },
  {
    id: "hw-2", subjectId: "kannada", grade: 2, title: "ಒತ್ತಕ್ಷರ ಅಭ್ಯಾಸ",
    instructions: "Write 5 words using conjunct letters (ಒತ್ತಕ್ಷರ) shown in class.",
    dueDate: "2026-07-07", totalQuestions: 5,
    topics: ["Vowel-sign recognition", "Conjunct formation"],
    createdAt: "2026-07-01",
  },
  {
    id: "hw-3", subjectId: "science", grade: 3, title: "Label the plant",
    instructions: "Draw a plant and label its roots, stem, leaves, and flower.",
    dueDate: "2026-07-10", totalQuestions: 4,
    topics: ["Root function", "Stem function", "Leaf function"],
    createdAt: "2026-07-03",
  },
  {
    id: "hw-4", subjectId: "english", grade: 3, title: "Write 5 simple sentences",
    instructions: "Write 5 simple sentences about your village, each with a clear subject and verb.",
    dueDate: "2026-07-06", totalQuestions: 5,
    topics: ["Vocabulary retention gap", "Subject identification"],
    createdAt: "2026-06-30",
  },
];

// A few already-completed submissions so the Teacher Dashboard has
// something meaningful to show on first load.
const INITIAL_SUBMISSIONS: HomeworkSubmission[] = [
  {
    id: "sub-seed-1", homeworkId: "hw-4", studentId: 3, correctCount: 5, totalQuestions: 5,
    mistakes: [], completedAt: "2026-07-01T10:00:00.000Z",
  },
  {
    id: "sub-seed-2", homeworkId: "hw-4", studentId: 1, correctCount: 3, totalQuestions: 5,
    mistakes: [
      { topic: "Vocabulary retention gap", note: "Used the same 2 words in every sentence — needs more vocabulary practice." },
      { topic: "Subject identification", note: "One sentence was missing a clear subject." },
    ],
    completedAt: "2026-07-01T11:20:00.000Z",
  },
  {
    id: "sub-seed-3", homeworkId: "hw-2", studentId: 6, correctCount: 2, totalQuestions: 5,
    mistakes: [
      { topic: "Vowel-sign recognition", note: "Confused the short and long vowel signs on 2 words." },
      { topic: "Conjunct formation", note: "Missed the halant (್) joining stroke on 1 word." },
    ],
    completedAt: "2026-07-02T09:15:00.000Z",
  },
];

/* ------------------------------------------------------------------ */
/*  LANGUAGE CONTENT — Student Mode strings, keyed by selected language */
/* ------------------------------------------------------------------ */
const LANG_CONTENT: Record<LangKey, {
  lessonTag: string; lessonDesc: string; quizQuestion: string; correctMsg: string;
  incorrectMsg: string; playVoice: string; playing: string; holdSpeak: string;
  listening: string; askHint: string; switchProfile: string; whosLearning: string;
  tapPicture: string; addChild: string;
}> = {
  Kannada: {
    lessonTag: "ಭಿನ್ನರಾಶಿ",
    lessonDesc: "(Fractions) — 2 ಸ್ನೇಹಿತರ ನಡುವೆ 4 ಮಾವಿನ ಹಣ್ಣುಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳುವುದು, ಗ್ರಾಮದ ಉದಾಹರಣೆಗಳೊಂದಿಗೆ ವಿವರಿಸಲಾಗಿದೆ.",
    quizQuestion: "4 ಮಾವಿನ ಹಣ್ಣುಗಳನ್ನು 2 ಜನ ಸ್ನೇಹಿತರ ನಡುವೆ ಸಮಾನವಾಗಿ ಹಂಚಿದರೆ, ತಲಾ ಎಷ್ಟು?",
    correctMsg: "ಸರಿ! ಮುಂದಿನ ಪ್ರಶ್ನೆ ಒಂದು ಹಂತ ಹೆಚ್ಚಿಸುತ್ತದೆ.",
    incorrectMsg: "ಸ್ವಲ್ಪ ತಪ್ಪು — GURU ಸರಳ ಉದಾಹರಣೆಯೊಂದಿಗೆ ಮತ್ತೆ ವಿವರಿಸುತ್ತದೆ.",
    playVoice: "ಧ್ವನಿ ವಿವರಣೆ ಪ್ಲೇ ಮಾಡಿ",
    playing: "ಪ್ಲೇ ಆಗುತ್ತಿದೆ…",
    holdSpeak: "ಮಾತನಾಡಲು ಒತ್ತಿ ಹಿಡಿಯಿರಿ",
    listening: "ಕೇಳಲಾಗುತ್ತಿದೆ…",
    askHint: "ಮಾತನಾಡಲು ಒತ್ತಿ ಹಿಡಿಯಿರಿ. ಸಂಪೂರ್ಣವಾಗಿ ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ.",
    switchProfile: "ಪ್ರೊಫೈಲ್ ಬದಲಿಸಿ",
    whosLearning: "ಇಂದು ಯಾರು ಕಲಿಯುತ್ತಿದ್ದಾರೆ?",
    tapPicture: "ಮುಂದುವರೆಯಲು ನಿಮ್ಮ ಚಿತ್ರವನ್ನು ಟ್ಯಾಪ್ ಮಾಡಿ",
    addChild: "ಮಗುವನ್ನು ಸೇರಿಸಿ",
  },
  Hindi: {
    lessonTag: "भिन्न",
    lessonDesc: "(Fractions) — 2 दोस्तों के बीच 4 आमों को बांटना, गांव के उदाहरणों के साथ समझाया गया।",
    quizQuestion: "यदि 4 आमों को 2 दोस्तों के बीच समान रूप से बांटा जाए, तो हर एक को कितने मिलेंगे?",
    correctMsg: "सही! अगला प्रश्न एक स्तर ऊपर जाएगा।",
    incorrectMsg: "थोड़ा गलत — GURU इसे एक सरल उदाहरण के साथ फिर से समझाएगा।",
    playVoice: "आवाज़ में समझाना सुनें",
    playing: "चल रहा है…",
    holdSpeak: "बोलने के लिए दबाकर रखें",
    listening: "सुन रहा है…",
    askHint: "बोलने के लिए दबाकर रखें। पूरी तरह ऑफ़लाइन काम करता है।",
    switchProfile: "प्रोफ़ाइल बदलें",
    whosLearning: "आज कौन सीख रहा है?",
    tapPicture: "जारी रखने के लिए अपनी तस्वीर पर टैप करें",
    addChild: "बच्चा जोड़ें",
  },
  English: {
    lessonTag: "Fractions",
    lessonDesc: "— sharing 4 mangoes among 2 friends, explained with village examples.",
    quizQuestion: "If 4 mangoes are shared equally between 2 friends, how many does each friend get?",
    correctMsg: "Correct! Next question adjusts up a level.",
    incorrectMsg: "Not quite — GURU will re-explain this with a simpler example.",
    playVoice: "Play voice explanation",
    playing: "Playing…",
    holdSpeak: "Hold to speak",
    listening: "Listening…",
    askHint: "Press and hold to speak. Works fully offline.",
    switchProfile: "Switch profile",
    whosLearning: "Who's learning today?",
    tapPicture: "Tap your picture to continue",
    addChild: "Add child",
  },
};

/* ------------------------------------------------------------------ */
/*  SMALL UI PRIMITIVES                                                 */
/* ------------------------------------------------------------------ */
function Card({ children, className = "", style = {} }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-2xl backdrop-blur-xl ${className}`}
      style={{ background: T.panel, border: `1px solid ${T.panelBorder}`, ...style }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children, color = T.marigold }: { children: ReactNode; color?: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase font-semibold mb-2"
      style={{ color, fontFamily: "'JetBrains Mono', monospace" }}
    >
      {children}
    </div>
  );
}

function Pill({ children, tone = "default" }: { children: ReactNode; tone?: PillTone }) {
  const map: Record<PillTone, { bg: string; fg: string }> = {
    default: { bg: "rgba(246,240,228,0.08)", fg: T.chalk },
    live: { bg: "rgba(127,168,147,0.18)", fg: T.green2 },
    warn: { bg: "rgba(217,112,92,0.18)", fg: T.danger },
    gold: { bg: "rgba(232,169,58,0.18)", fg: T.marigoldSoft },
  };
  const s = map[tone];
  return (
    <span
      className="px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5"
      style={{ background: s.bg, color: s.fg, fontFamily: "'JetBrains Mono', monospace" }}
    >
      {children}
    </span>
  );
}

function SectionTitle({ eyebrow, title, sub, color }: { eyebrow: string; title: string; sub?: string; color: string }) {
  return (
    <div className="mb-6">
      <Eyebrow color={color}>{eyebrow}</Eyebrow>
      <h2
        className="text-2xl md:text-3xl"
        style={{ fontFamily: "'Fraunces', serif", color: T.cream, fontWeight: 600 }}
      >
        {title}
      </h2>
      {sub && <p className="mt-1.5 text-sm max-w-xl" style={{ color: T.chalk, opacity: 0.8 }}>{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NAV                                                                 */
/* ------------------------------------------------------------------ */
function TopNav({ view, setView, online, setOnline, sync }: {
  view: ViewId;
  setView: Dispatch<SetStateAction<ViewId>>;
  online: boolean;
  setOnline: () => void;
  sync: OfflineSync;
}) {
  const pillLabel =
    sync.status === "syncing" ? `Syncing ${sync.pendingCount} item${sync.pendingCount === 1 ? "" : "s"}…`
    : sync.status === "sync-error" ? `${sync.pendingCount} queued — retrying`
    : online ? "Online · Synced"
    : `Offline${sync.pendingCount ? ` · ${sync.pendingCount} queued` : ""}`;
  const tabs: { id: ViewId; label: string; icon: LucideIcon }[] = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "teacher", label: "Teacher Dashboard", icon: GraduationCap },
    { id: "student", label: "Student Mode", icon: User },
    { id: "agents", label: "Agent Architecture", icon: Network },
    { id: "live", label: "Live Agents", icon: Radio },
  ];
  return (
    <div className="sticky top-0 z-30 backdrop-blur-xl" style={{ background: "rgba(19,41,34,0.85)", borderBottom: `1px solid ${T.panelBorder}` }}>
      <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.marigold }}>
            <Sprout size={17} color={T.bg} strokeWidth={2.5} />
          </div>
          <span style={{ fontFamily: "'Fraunces', serif", color: T.cream, fontWeight: 600 }} className="text-lg">GURU AI</span>
        </div>
        <div className="hidden md:flex items-center gap-1 rounded-full p-1" style={{ background: "rgba(0,0,0,0.18)" }}>
          {tabs.map(t => {
            const Icon = t.icon;
            const active = view === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200"
                style={{
                  background: active ? T.marigold : "transparent",
                  color: active ? T.bg : T.chalk,
                }}
              >
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={setOnline}
          title="Toggle to simulate offline mode (demo) — real connectivity is also detected automatically"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
          style={{
            background: sync.status === "syncing" ? "rgba(232,169,58,0.18)" : online ? "rgba(127,168,147,0.18)" : "rgba(217,112,92,0.18)",
            color: sync.status === "syncing" ? T.marigoldSoft : online ? T.green2 : T.danger,
          }}
        >
          {sync.status === "syncing" ? <RefreshCw size={13} className="animate-spin" /> : online ? <Wifi size={13} /> : <WifiOff size={13} />}
          {pillLabel}
        </button>
      </div>
      <div className="md:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = view === t.id;
          return (
            <button key={t.id} onClick={() => setView(t.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
              style={{ background: active ? T.marigold : "rgba(0,0,0,0.18)", color: active ? T.bg : T.chalk }}>
              <Icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  OVERVIEW / LANDING                                                  */
/* ------------------------------------------------------------------ */
function Overview({ setView }: { setView: Dispatch<SetStateAction<ViewId>> }) {
  const [gridPulse, setGridPulse] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setGridPulse(p => (p + 1) % 30), 900);
    return () => clearInterval(iv);
  }, []);

  const novelFeatures = [
    { icon: Brain, title: "AI Digital Twin", desc: "A living memory profile per student — every strength, gap and pace, remembered across years." },
    { icon: TrendingUp, title: "Predictive Lesson Planning", desc: "Tomorrow's lesson plan is drafted tonight, from today's real class performance." },
    { icon: Users, title: "Peer Learning Engine", desc: "Automatically pairs a strong and struggling student on the exact concept that needs it." },
    { icon: Sprout, title: "Community Knowledge Engine", desc: "Swaps textbook clichés for the village's own crops, markets and festivals." },
    { icon: Network, title: "Concept Dependency Graph", desc: "Traces a wrong answer back to the real root-cause concept, one or two grades earlier." },
    { icon: Radio, title: "Classroom Intelligence Score", desc: "Reads engagement from quiz rhythm and interaction patterns — no cameras, no surveillance." },
    { icon: CloudOff, title: "Offline-First Core", desc: "Every feature works with zero signal; sync happens silently the moment a bar of network appears." },
    { icon: Layers, title: "Long-Term Memory", desc: "Concepts learned in Grade 1 stay knowable and referenceable all the way to Grade 5." },
  ];

  return (
    <div>
      {/* HERO */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-16 pb-20 relative overflow-hidden">
        <div className="grid lg:grid-cols-[1.1fr,0.9fr] gap-12 items-center">
          <div>
            <Eyebrow>Offline-First Multi-Agent Classroom OS</Eyebrow>
            <h1 style={{ fontFamily: "'Fraunces', serif", color: T.cream, fontWeight: 600, lineHeight: 1.05 }} className="text-4xl md:text-6xl mb-6">
              One teacher.<br />
              <span style={{ color: T.marigold }}>Five grades.</span><br />
              One classroom that keeps up.
            </h1>
            <p className="text-base md:text-lg max-w-lg mb-8" style={{ color: T.chalk, opacity: 0.85 }}>
              GURU AI is not a chatbot bolted onto a classroom. It&apos;s ten specialist AI agents working
              under one orchestrator — teaching, translating, quizzing, and remembering every child,
              even when the internet doesn&apos;t show up.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setView("teacher")}
                className="px-5 py-3 rounded-xl font-semibold text-sm flex items-center gap-2 transition-transform hover:scale-[1.02]"
                style={{ background: T.marigold, color: T.bg }}>
                Open Teacher Dashboard <ArrowRight size={15} />
              </button>
              <button onClick={() => setView("student")}
                className="px-5 py-3 rounded-xl font-semibold text-sm flex items-center gap-2 border transition-transform hover:scale-[1.02]"
                style={{ borderColor: T.panelBorder, color: T.cream }}>
                Try Student Mode <Play size={14} />
              </button>
            </div>
            <div className="flex items-center gap-6 mt-9">
              {[["30–50", "students / classroom"], ["10", "specialist AI agents"], ["100%", "usable offline"]].map(([n, l]) => (
                <div key={l}>
                  <div style={{ fontFamily: "'Fraunces', serif", color: T.marigoldSoft }} className="text-2xl font-semibold">{n}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: T.chalk, opacity: 0.7 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* SIGNATURE VISUAL: chalk-grid mastery pulse, standing in for the classroom */}
          <Card className="p-6 relative">
            <div className="flex items-center justify-between mb-4">
              <Eyebrow color={T.green2}>Live · Classroom Intelligence Score</Eyebrow>
              <Pill tone="live"><span className="w-1.5 h-1.5 rounded-full" style={{ background: T.green2 }} /> reading</Pill>
            </div>
            <div className="grid grid-cols-6 gap-1.5 mb-5">
              {Array.from({ length: 42 }).map((_, i) => {
                const lit = (i + gridPulse) % 7 === 0 || (i * 3 + gridPulse) % 11 === 0;
                return (
                  <div key={i} className="aspect-square rounded-md transition-all duration-700"
                    style={{
                      background: lit ? T.marigold : "rgba(246,240,228,0.06)",
                      opacity: lit ? 0.9 : 0.5,
                    }} />
                );
              })}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: T.chalk, opacity: 0.75 }}>
              Each cell is a live concept-attempt across the room — no cameras, no faces. Just
              response timing and quiz rhythm, turned into one engagement signal for the teacher.
            </p>
            <div className="mt-5 pt-5 flex items-center justify-between" style={{ borderTop: `1px solid ${T.panelBorder}` }}>
              <span className="text-xs" style={{ color: T.chalk }}>Today&apos;s Classroom Health</span>
              <span style={{ fontFamily: "'Fraunces', serif", color: T.marigoldSoft }} className="text-xl font-semibold">79 / 100</span>
            </div>
          </Card>
        </div>
      </section>

      {/* AGENT STRIP */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pb-16">
        <SectionTitle eyebrow="Under the hood" title="Ten agents, one orchestrator" color={T.indigo}
          sub="Every upload, question, and quiz passes through a coordinated multi-agent pipeline — not a single monolithic model." />
        <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
          {agents.map(a => {
            const Icon = a.icon;
            return (
              <div key={a.name} className="shrink-0 w-[220px] p-4 rounded-2xl" style={{ background: T.panel, border: `1px solid ${T.panelBorder}` }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: `${a.color}22` }}>
                  <Icon size={15} color={a.color} />
                </div>
                <div className="text-sm font-semibold mb-1" style={{ color: T.cream }}>{a.name}</div>
                <div className="text-[11px] leading-snug" style={{ color: T.chalk, opacity: 0.7 }}>{a.role}</div>
              </div>
            );
          })}
        </div>
        <button onClick={() => setView("agents")} className="mt-4 text-xs font-semibold flex items-center gap-1" style={{ color: T.marigoldSoft }}>
          See full architecture <ChevronRight size={13} />
        </button>
      </section>

      {/* NOVELTY GRID */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pb-20">
        <SectionTitle eyebrow="Research novelty" title="What makes this more than a chatbot" color={T.clay} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {novelFeatures.map(f => {
            const Icon = f.icon;
            return (
              <Card key={f.title} className="p-5 hover:translate-y-[-2px] transition-transform duration-200">
                <Icon size={18} color={T.marigold} className="mb-3" />
                <div className="text-sm font-semibold mb-1.5" style={{ color: T.cream }}>{f.title}</div>
                <div className="text-[12px] leading-relaxed" style={{ color: T.chalk, opacity: 0.75 }}>{f.desc}</div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* COMMUNITY KNOWLEDGE DEMO */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pb-24">
        <SectionTitle eyebrow="Community Knowledge Engine" title="Same concept, the village's own words" color={T.clay}
          sub="The Community Knowledge Agent rewrites generic textbook examples using local geography, crops, and markets." />
        <div className="grid md:grid-cols-2 gap-4">
          {villageExamples.map((v, i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Pill tone="warn"><X size={10} /> Textbook default</Pill>
              </div>
              <p className="text-sm mb-4 line-through decoration-1" style={{ color: T.chalk, opacity: 0.5 }}>{v.generic}</p>
              <div className="flex items-center gap-2 mb-3">
                <Pill tone="live"><Check size={10} /> GURU AI localised</Pill>
              </div>
              <p className="text-sm" style={{ color: T.cream }}>{v.local}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TEACHER DASHBOARD                                                    */
/* ------------------------------------------------------------------ */
function TeacherDashboard({
  online, sync, materials, setMaterials, homeworkList, setHomeworkList, submissions, lastGenerated,
}: {
  online: boolean;
  sync: OfflineSync;
  materials: StudyMaterial[];
  setMaterials: Dispatch<SetStateAction<StudyMaterial[]>>;
  homeworkList: Homework[];
  setHomeworkList: Dispatch<SetStateAction<Homework[]>>;
  submissions: HomeworkSubmission[];
  lastGenerated: GenerateLessonResponse | null;
}) {
  const [selectedStudent, setSelectedStudent] = useState<Student>(students[1]);
  // Local attendance marks, keyed by student id, for today. Every tap writes
  // through sync.enqueue — straight into IndexedDB, then to MongoDB the
  // instant connectivity allows — so this works identically online or off.
  const [todaysMarks, setTodaysMarks] = useState<Record<number, "present" | "absent">>({});
  const todayISO = new Date().toISOString().slice(0, 10);

  const [activeSubject, setActiveSubject] = useState<SubjectId>(SUBJECTS[0].id);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialGrade, setMaterialGrade] = useState(3);
  const [materialContent, setMaterialContent] = useState("");

  const [homeworkModalOpen, setHomeworkModalOpen] = useState(false);
  const [hwTitle, setHwTitle] = useState("");
  const [hwInstructions, setHwInstructions] = useState("");
  const [hwGrade, setHwGrade] = useState<number | "all">("all");
  const [hwDueDate, setHwDueDate] = useState(todayISO);
  const [hwQuestions, setHwQuestions] = useState(5);
  const [hwTopics, setHwTopics] = useState("");

  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);

  async function markAttendance(student: Student, status: "present" | "absent") {
    setTodaysMarks(prev => ({ ...prev, [student.id]: status }));
    await sync.enqueue("attendance.mark", {
      student_id: String(student.id),
      date: todayISO,
      status,
      marked_offline: sync.isOffline,
    });
  }

  async function submitMaterial() {
    if (!materialTitle.trim() || !materialContent.trim()) return;
    const newMaterial: StudyMaterial = {
      id: `m-${Date.now()}`,
      subjectId: activeSubject,
      grade: materialGrade,
      title: materialTitle.trim(),
      uploadedBy: "Teacher",
      content: {
        English: materialContent.trim(),
        Kannada: pseudoTranslate(materialContent.trim(), "Kannada"),
        Hindi: pseudoTranslate(materialContent.trim(), "Hindi"),
      },
    };
    setMaterials(prev => [newMaterial, ...prev]);
    await sync.enqueue("study_material.create", { subject: activeSubject, title: newMaterial.title, grade: materialGrade });
    setMaterialTitle(""); setMaterialContent(""); setMaterialModalOpen(false);
  }

  async function submitHomework() {
    if (!hwTitle.trim() || !hwInstructions.trim()) return;
    const newHomework: Homework = {
      id: `hw-${Date.now()}`,
      subjectId: activeSubject,
      grade: hwGrade,
      title: hwTitle.trim(),
      instructions: hwInstructions.trim(),
      dueDate: hwDueDate,
      totalQuestions: Math.max(1, hwQuestions),
      topics: hwTopics.split(",").map(t => t.trim()).filter(Boolean),
      createdAt: todayISO,
    };
    setHomeworkList(prev => [newHomework, ...prev]);
    await sync.enqueue("homework.create", { subject: activeSubject, title: newHomework.title, grade: hwGrade });
    setHwTitle(""); setHwInstructions(""); setHwGrade("all"); setHwDueDate(todayISO); setHwQuestions(5); setHwTopics("");
    setHomeworkModalOpen(false);
  }

  const classroomHealth = 79;
  const markedCount = Object.keys(todaysMarks).length;
  const attendance = { present: 38 + Object.values(todaysMarks).filter(s => s === "present").length, total: 44 };

  const subjectMaterials = materials.filter(m => m.subjectId === activeSubject);
  const activeSubjectDef = SUBJECTS.find(s => s.id === activeSubject)!;

  const studentHomework = homeworkList.filter(h => h.grade === "all" || h.grade === selectedStudent.grade);
  const studentSubs = submissions.filter(s => s.studentId === selectedStudent.id);
  const pendingHw = studentHomework.filter(h => !studentSubs.some(s => s.homeworkId === h.id));
  const completedHw = studentHomework
    .map(h => ({ h, sub: studentSubs.find(s => s.homeworkId === h.id) }))
    .filter((x): x is { h: Homework; sub: HomeworkSubmission } => !!x.sub)
    .sort((a, b) => b.sub.completedAt.localeCompare(a.sub.completedAt));

  // Peer Learning Agent: pair the weaker half of the class with the stronger
  // half, matched so each pair spans the widest possible mastery gap.
  const sortedByMastery = [...students].sort((a, b) => a.mastery - b.mastery);
  const half = Math.floor(sortedByMastery.length / 2);
  const peerPairs = sortedByMastery.slice(0, half).map((weak, i) => ({
    weak, strong: sortedByMastery[sortedByMastery.length - 1 - i],
  }));

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <Eyebrow>Govt. Higher Primary School · Chintamani</Eyebrow>
          <h1 style={{ fontFamily: "'Fraunces', serif", color: T.cream, fontWeight: 600 }} className="text-3xl">Good morning, Teacher</h1>
          <p className="text-sm mt-1" style={{ color: T.chalk, opacity: 0.8 }}>Grades 1–5 combined · {attendance.total} enrolled</p>
        </div>
      </div>

      <TeacherInsightsPanel roster={students} conceptId={lastGenerated?.lesson.concept_id as string | undefined ?? null} />

      {/* TOP STAT ROW */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-5">
          <Eyebrow color={T.green2}>Classroom Health</Eyebrow>
          <div style={{ fontFamily: "'Fraunces', serif", color: T.cream }} className="text-3xl font-semibold mb-1">{classroomHealth}<span className="text-base opacity-50">/100</span></div>
          <div className="h-1.5 rounded-full overflow-hidden mt-3" style={{ background: "rgba(0,0,0,0.25)" }}>
            <div className="h-full rounded-full" style={{ width: `${classroomHealth}%`, background: T.green2 }} />
          </div>
        </Card>
        <Card className="p-5">
          <Eyebrow color={T.marigold}>Attendance Today</Eyebrow>
          <div style={{ fontFamily: "'Fraunces', serif", color: T.cream }} className="text-3xl font-semibold mb-1">{attendance.present}<span className="text-base opacity-50">/{attendance.total}</span></div>
          <div className="text-[11px]" style={{ color: T.chalk, opacity: 0.7 }}>6 marked absent, auto-flagged for follow-up</div>
        </Card>
        <Card className="p-5">
          <Eyebrow color={T.indigo}>Offline Sync Queue</Eyebrow>
          <div style={{ fontFamily: "'Fraunces', serif", color: T.cream }} className="text-3xl font-semibold mb-1">{sync.pendingCount}</div>
          <div className="text-[11px] flex items-center gap-1" style={{ color: sync.pendingCount === 0 ? T.green2 : online ? T.marigoldSoft : T.danger }}>
            {sync.pendingCount === 0
              ? <><RefreshCw size={11} /> all synced to MongoDB</>
              : online
                ? <><RefreshCw size={11} className="animate-spin" /> syncing now…</>
                : <><CloudOff size={11} /> queued on this device</>}
          </div>
        </Card>
        <Card className="p-5">
          <Eyebrow color={T.clay}>AI Suggestion</Eyebrow>
          <div className="text-sm leading-snug" style={{ color: T.cream }}>Reteach <b>fraction division</b> using the rice-sack sharing example before Friday&apos;s quiz.</div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1fr,1fr,0.85fr] gap-5">
        {/* WEAK CONCEPTS / DEPENDENCY GRAPH */}
        <Card className="p-5 lg:col-span-2">
          <SectionTitle eyebrow="Concept Dependency Graph" title="Weak concepts & their root cause" color={T.clay} />
          <div className="space-y-3">
            {weakConcepts.map(w => (
              <div key={w.concept} className="p-4 rounded-xl" style={{ background: "rgba(0,0,0,0.18)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold" style={{ color: T.cream }}>{w.concept}</span>
                  <Pill tone="warn"><AlertTriangle size={10} /> {w.affected} students</Pill>
                </div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: T.chalk, opacity: 0.75 }}>
                  <Network size={12} color={T.indigo} /> root cause traced to:
                  <span style={{ color: T.indigo }} className="font-medium">{w.root}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${T.panelBorder}` }}>
            <div className="text-xs font-semibold mb-3" style={{ color: T.chalk }}>7-day Classroom Health trend</div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={weeklyClassHealth}>
                <defs>
                  <linearGradient id="healthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.marigold} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={T.marigold} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: T.chalk, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[40, 100]} />
                <Tooltip contentStyle={{ background: T.bgSoft, border: `1px solid ${T.panelBorder}`, borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="score" stroke={T.marigold} strokeWidth={2} fill="url(#healthFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* STUDENT LIST + DIGITAL TWIN */}
        <Card className="p-5">
          <SectionTitle eyebrow="AI Digital Twin" title="Student profiles" color={T.indigo} />
          <div className="space-y-1.5 mb-5 max-h-[220px] overflow-y-auto pr-1">
            {students.map(s => {
              const mark = todaysMarks[s.id];
              return (
                <div key={s.id}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors"
                  style={{ background: selectedStudent.id === s.id ? "rgba(232,169,58,0.14)" : "transparent" }}>
                  <button onClick={() => setSelectedStudent(s)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: s.avatarColor, color: T.bg }}>
                      {s.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: T.cream }}>{s.name}</div>
                      <div className="text-[11px]" style={{ color: T.chalk, opacity: 0.65 }}>Grade {s.grade} · {s.lang}</div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => markAttendance(s, "present")} title="Mark present"
                      className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                      style={{ background: mark === "present" ? "rgba(127,168,147,0.3)" : "rgba(246,240,228,0.06)", color: mark === "present" ? T.green2 : T.chalk }}>
                      <Check size={11} />
                    </button>
                    <button onClick={() => markAttendance(s, "absent")} title="Mark absent"
                      className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                      style={{ background: mark === "absent" ? "rgba(217,112,92,0.3)" : "rgba(246,240,228,0.06)", color: mark === "absent" ? T.danger : T.chalk }}>
                      <X size={11} />
                    </button>
                  </div>
                  <div className="text-xs font-semibold shrink-0" style={{ color: s.mastery > 70 ? T.green2 : s.mastery > 45 ? T.marigoldSoft : T.danger }}>
                    {s.mastery}%
                  </div>
                </div>
              );
            })}
          </div>
          {markedCount > 0 && (
            <div className="text-[11px] mb-3 flex items-center gap-1.5" style={{ color: sync.isOffline ? T.marigoldSoft : T.green2 }}>
              {sync.isOffline ? <CloudOff size={11} /> : <Check size={11} />}
              {markedCount} attendance mark{markedCount === 1 ? "" : "s"} {sync.isOffline ? "saved on this device — will sync automatically" : "synced to the server"}
            </div>
          )}
          <div className="pt-4" style={{ borderTop: `1px solid ${T.panelBorder}` }}>
            <div className="text-xs font-semibold mb-2" style={{ color: T.chalk }}>{selectedStudent.name}&apos;s learning twin</div>
            <ResponsiveContainer width="100%" height={160}>
              <RadarChart data={radarData.map((r, i) => ({ ...r, A: selectedStudent.twin[i] }))} outerRadius={60}>
                <PolarGrid stroke={T.panelBorder} />
                <PolarAngleAxis dataKey="subject" tick={{ fill: T.chalk, fontSize: 10 }} />
                <Radar dataKey="A" stroke={T.marigold} fill={T.marigold} fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-between text-[11px] mt-2" style={{ color: T.chalk, opacity: 0.7 }}>
              <span>🔥 {selectedStudent.streak}-day streak</span>
              <span>Grade {selectedStudent.grade} · {selectedStudent.lang}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* SUBJECTS — study material + homework, per subject */}
      <Card className="p-5 mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <SectionTitle eyebrow="Subjects" title="Study material & homework" color={T.marigold} />
          <div className="flex gap-2">
            <button onClick={() => setMaterialModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
              style={{ background: "rgba(246,240,228,0.08)", color: T.cream, border: `1px solid ${T.panelBorder}` }}>
              <Upload size={13} /> Upload material
            </button>
            <button onClick={() => setHomeworkModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
              style={{ background: T.marigold, color: T.bg }}>
              <ClipboardList size={13} /> Give homework
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
          {SUBJECTS.map(s => {
            const Icon = s.icon;
            const active = activeSubject === s.id;
            return (
              <button key={s.id} onClick={() => setActiveSubject(s.id)}
                className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-colors"
                style={{ background: active ? `${s.color}26` : "rgba(246,240,228,0.05)", border: `1px solid ${active ? s.color : T.panelBorder}`, color: active ? s.color : T.chalk }}>
                <Icon size={13} /> {s.name}
              </button>
            );
          })}
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {subjectMaterials.length === 0 && (
            <p className="text-xs col-span-2" style={{ color: T.chalk, opacity: 0.6 }}>No material uploaded yet for {activeSubjectDef.name}.</p>
          )}
          {subjectMaterials.map(m => (
            <div key={m.id} className="p-3.5 rounded-xl" style={{ background: "rgba(0,0,0,0.18)" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold" style={{ color: T.cream }}>{m.title}</span>
                <Pill>Grade {m.grade}</Pill>
              </div>
              <div className="text-[11px]" style={{ color: T.chalk, opacity: 0.65 }}>Uploaded by {m.uploadedBy} · available in Kannada, Hindi & English</div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${T.panelBorder}` }}>
          <div className="text-xs font-semibold mb-2" style={{ color: T.chalk }}>Homework given in {activeSubjectDef.name}</div>
          <div className="space-y-2">
            {homeworkList.filter(h => h.subjectId === activeSubject).map(h => (
              <div key={h.id} className="flex items-center justify-between text-xs p-2.5 rounded-lg" style={{ background: "rgba(246,240,228,0.04)" }}>
                <span style={{ color: T.cream }}>{h.title}</span>
                <span style={{ color: T.chalk, opacity: 0.7 }}>Grade {h.grade === "all" ? "1–5" : h.grade} · due {h.dueDate}</span>
              </div>
            ))}
            {homeworkList.filter(h => h.subjectId === activeSubject).length === 0 && (
              <p className="text-xs" style={{ color: T.chalk, opacity: 0.6 }}>No homework given yet in {activeSubjectDef.name}.</p>
            )}
          </div>
        </div>
      </Card>

      {/* HOMEWORK ACTIVITY + PEER LEARNING */}
      <div className="grid lg:grid-cols-[1.3fr,1fr] gap-5 mt-5">
        <Card className="p-5">
          <SectionTitle eyebrow="Progress Agent" title={`${selectedStudent.name}'s homework & activity`} color={T.green2} />

          <div className="mb-4">
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: T.marigoldSoft }}>
              <Circle size={10} /> Pending ({pendingHw.length})
            </div>
            {pendingHw.length === 0 && <p className="text-xs" style={{ color: T.chalk, opacity: 0.6 }}>Nothing pending — all caught up.</p>}
            <div className="space-y-1.5">
              {pendingHw.map(h => (
                <div key={h.id} className="flex items-center justify-between text-xs p-2.5 rounded-lg" style={{ background: "rgba(232,169,58,0.08)" }}>
                  <span style={{ color: T.cream }}>{h.title} <span style={{ color: T.chalk, opacity: 0.6 }}>· {SUBJECTS.find(s => s.id === h.subjectId)?.name}</span></span>
                  <Pill tone="warn">due {h.dueDate}</Pill>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: T.green2 }}>
              <CheckCircle2 size={12} /> Completed ({completedHw.length})
            </div>
            {completedHw.length === 0 && <p className="text-xs" style={{ color: T.chalk, opacity: 0.6 }}>No completed activity yet.</p>}
            <div className="space-y-2">
              {completedHw.map(({ h, sub }) => {
                const pct = Math.round((sub.correctCount / sub.totalQuestions) * 100);
                const expanded = expandedSubmissionId === sub.id;
                return (
                  <div key={sub.id} className="p-3 rounded-xl" style={{ background: "rgba(0,0,0,0.18)" }}>
                    <button className="w-full flex items-center justify-between" onClick={() => setExpandedSubmissionId(expanded ? null : sub.id)}>
                      <span className="text-sm font-medium" style={{ color: T.cream }}>{h.title}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: pct >= 80 ? T.green2 : pct >= 50 ? T.marigoldSoft : T.danger }}>
                          {sub.correctCount}/{sub.totalQuestions} ({pct}%)
                        </span>
                        <ChevronRight size={13} color={T.chalk} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                      </span>
                    </button>
                    {expanded && (
                      <div className="mt-2.5 pt-2.5 space-y-1.5" style={{ borderTop: `1px solid ${T.panelBorder}` }}>
                        {sub.mistakes.length === 0 ? (
                          <p className="text-xs flex items-center gap-1.5" style={{ color: T.green2 }}><Trophy size={12} /> No mistakes — full marks.</p>
                        ) : sub.mistakes.map((m, i) => (
                          <div key={i} className="text-xs" style={{ color: T.chalk }}>
                            <span className="font-semibold" style={{ color: T.danger }}>{m.topic}: </span>{m.note}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle eyebrow="Peer Learning Agent" title="Suggested peer pairs" color={T.indigo} />
          <div className="space-y-2.5">
            {peerPairs.map(({ weak, strong }) => (
              <div key={`${weak.id}-${strong.id}`} className="p-3 rounded-xl flex items-center justify-between gap-2" style={{ background: "rgba(0,0,0,0.18)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: weak.avatarColor, color: T.bg }}>{weak.name[0]}</div>
                  <span className="text-xs font-medium truncate" style={{ color: T.cream }}>{weak.name}</span>
                  <span className="text-[10px]" style={{ color: T.chalk, opacity: 0.6 }}>{weak.mastery}%</span>
                </div>
                <Users size={13} color={T.marigold} className="shrink-0" />
                <div className="flex items-center gap-2 min-w-0 justify-end">
                  <span className="text-[10px]" style={{ color: T.chalk, opacity: 0.6 }}>{strong.mastery}%</span>
                  <span className="text-xs font-medium truncate" style={{ color: T.cream }}>{strong.name}</span>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: strong.avatarColor, color: T.bg }}>{strong.name[0]}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-4 leading-relaxed" style={{ color: T.chalk, opacity: 0.65 }}>
            Pairs are matched on the widest mastery gap so the stronger student can buddy-teach the exact concept the other is struggling with.
          </p>
        </Card>
      </div>

      {/* UPLOAD MATERIAL MODAL */}
      {materialModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setMaterialModalOpen(false)}>
          <Card className="p-6 max-w-md w-full" style={{ background: T.bgSoft }}>
            <div onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 style={{ fontFamily: "'Fraunces', serif", color: T.cream }} className="text-lg font-semibold">Upload material · {activeSubjectDef.name}</h3>
                <button onClick={() => setMaterialModalOpen(false)}><X size={18} color={T.chalk} /></button>
              </div>
              <label className="text-[11px] font-semibold block mb-1" style={{ color: T.chalk }}>Title</label>
              <input value={materialTitle} onChange={e => setMaterialTitle(e.target.value)} placeholder="e.g. Multiplication tables"
                className="w-full mb-3 text-sm rounded-lg px-3 py-2 outline-none" style={{ background: "rgba(0,0,0,0.25)", color: T.cream, border: `1px solid ${T.panelBorder}` }} />
              <label className="text-[11px] font-semibold block mb-1" style={{ color: T.chalk }}>Grade</label>
              <select value={materialGrade} onChange={e => setMaterialGrade(Number(e.target.value))}
                className="w-full mb-3 text-sm rounded-lg px-3 py-2 outline-none" style={{ background: "rgba(0,0,0,0.25)", color: T.cream, border: `1px solid ${T.panelBorder}` }}>
                {[1, 2, 3, 4, 5].map(g => <option key={g} value={g} style={{ color: "#000" }}>Grade {g}</option>)}
              </select>
              <label className="text-[11px] font-semibold block mb-1" style={{ color: T.chalk }}>Content / notes (English)</label>
              <textarea value={materialContent} onChange={e => setMaterialContent(e.target.value)} rows={4} placeholder="Type or paste the lesson content — a photo/PDF/voice upload works the same way in the field app."
                className="w-full mb-3 text-sm rounded-lg px-3 py-2 outline-none resize-none" style={{ background: "rgba(0,0,0,0.25)", color: T.cream, border: `1px solid ${T.panelBorder}` }} />
              <p className="text-[11px] mb-4 leading-relaxed" style={{ color: T.chalk, opacity: 0.7 }}>
                The Language Agent automatically creates Kannada and Hindi versions so struggling students can switch language on their own profile.
              </p>
              <button onClick={submitMaterial}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: T.marigold, color: T.bg }}>
                <Upload size={14} /> Save material {online ? "" : "(queued offline)"}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* GIVE HOMEWORK MODAL */}
      {homeworkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setHomeworkModalOpen(false)}>
          <Card className="p-6 max-w-md w-full" style={{ background: T.bgSoft }}>
            <div onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 style={{ fontFamily: "'Fraunces', serif", color: T.cream }} className="text-lg font-semibold">Give homework · {activeSubjectDef.name}</h3>
                <button onClick={() => setHomeworkModalOpen(false)}><X size={18} color={T.chalk} /></button>
              </div>
              <label className="text-[11px] font-semibold block mb-1" style={{ color: T.chalk }}>Title</label>
              <input value={hwTitle} onChange={e => setHwTitle(e.target.value)} placeholder="e.g. Practice worksheet 3"
                className="w-full mb-3 text-sm rounded-lg px-3 py-2 outline-none" style={{ background: "rgba(0,0,0,0.25)", color: T.cream, border: `1px solid ${T.panelBorder}` }} />
              <label className="text-[11px] font-semibold block mb-1" style={{ color: T.chalk }}>Instructions</label>
              <textarea value={hwInstructions} onChange={e => setHwInstructions(e.target.value)} rows={3} placeholder="What should students do?"
                className="w-full mb-3 text-sm rounded-lg px-3 py-2 outline-none resize-none" style={{ background: "rgba(0,0,0,0.25)", color: T.cream, border: `1px solid ${T.panelBorder}` }} />
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[11px] font-semibold block mb-1" style={{ color: T.chalk }}>Grade</label>
                  <select value={hwGrade} onChange={e => setHwGrade(e.target.value === "all" ? "all" : Number(e.target.value))}
                    className="w-full text-sm rounded-lg px-3 py-2 outline-none" style={{ background: "rgba(0,0,0,0.25)", color: T.cream, border: `1px solid ${T.panelBorder}` }}>
                    <option value="all" style={{ color: "#000" }}>All grades</option>
                    {[1, 2, 3, 4, 5].map(g => <option key={g} value={g} style={{ color: "#000" }}>Grade {g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold block mb-1" style={{ color: T.chalk }}>Due date</label>
                  <input type="date" value={hwDueDate} onChange={e => setHwDueDate(e.target.value)}
                    className="w-full text-sm rounded-lg px-3 py-2 outline-none" style={{ background: "rgba(0,0,0,0.25)", color: T.cream, border: `1px solid ${T.panelBorder}` }} />
                </div>
              </div>
              <label className="text-[11px] font-semibold block mb-1" style={{ color: T.chalk }}>Number of questions</label>
              <input type="number" min={1} max={20} value={hwQuestions} onChange={e => setHwQuestions(Number(e.target.value))}
                className="w-full mb-3 text-sm rounded-lg px-3 py-2 outline-none" style={{ background: "rgba(0,0,0,0.25)", color: T.cream, border: `1px solid ${T.panelBorder}` }} />
              <label className="text-[11px] font-semibold block mb-1" style={{ color: T.chalk }}>Key topics covered (comma separated)</label>
              <input value={hwTopics} onChange={e => setHwTopics(e.target.value)} placeholder="e.g. fractions, remainders"
                className="w-full mb-4 text-sm rounded-lg px-3 py-2 outline-none" style={{ background: "rgba(0,0,0,0.25)", color: T.cream, border: `1px solid ${T.panelBorder}` }} />
              <p className="text-[11px] mb-4 leading-relaxed" style={{ color: T.chalk, opacity: 0.7 }}>
                Topics are used by the Progress Agent to explain exactly where a student went wrong once they submit.
              </p>
              <button onClick={submitHomework}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: T.marigold, color: T.bg }}>
                <ClipboardList size={14} /> Assign homework {online ? "" : "(queued offline)"}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  STUDENT MODE                                                        */
/* ------------------------------------------------------------------ */
function StudentMode({
  online, sync, materials, homeworkList, submissions, setSubmissions, lastGenerated,
}: {
  online: boolean;
  sync: OfflineSync;
  materials: StudyMaterial[];
  homeworkList: Homework[];
  submissions: HomeworkSubmission[];
  setSubmissions: Dispatch<SetStateAction<HomeworkSubmission[]>>;
  lastGenerated: GenerateLessonResponse | null;
}) {
  const [active, setActive] = useState<Student | null>(null);
  const [lang, setLang] = useState<LangKey>("Kannada");
  const [quizAnswered, setQuizAnswered] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const recorderRef = useRef<{ stop: () => Promise<Blob> } | null>(null);
  const [roster, setRoster] = useState<Student[]>(students.slice(0, 4));
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [openSubject, setOpenSubject] = useState<SubjectId | null>(null);
  const [materialLang, setMaterialLang] = useState<Record<string, LangKey>>({});

  const L = LANG_CONTENT[lang] || LANG_CONTENT.Kannada;
  const avatarPalette = [T.marigold, T.clay, T.green2, T.indigo, T.marigoldSoft, T.danger];

  function handleAddChild() {
    const name = childName.trim();
    if (!name) { setAddingChild(false); return; }
    const newStudent = {
      id: Date.now(),
      name,
      grade: 1,
      lang: "Kannada",
      mastery: 0,
      streak: 0,
      twin: [20, 20, 20, 20, 20],
      avatarColor: avatarPalette[roster.length % avatarPalette.length],
    };
    setRoster(r => [...r, newStudent]);
    setChildName("");
    setAddingChild(false);
  }

  function handlePlayVoice() {
    if (playing) return;
    setPlaying(true);
    // Real Web Speech API TTS (Voice Agent, spoken-output half) — speaks
    // today's lesson in whatever language the student currently has
    // selected. onEnd resets the button; if the browser has no speech
    // synthesis at all, speak() calls onEnd immediately instead of hanging.
    speak(`${L.lessonTag}. ${L.lessonDesc}`, langKeyToCode(lang), () => setPlaying(false));
  }

  function startListening() {
    if (listening) return;
    setTranscript(null);
    setMicError(null);
    setListening(true);
    recorderRef.current = startRecording(() => {
      setMicError("Couldn't access the microphone — check browser permissions.");
      setListening(false);
      recorderRef.current = null;
    });
  }

  async function stopListening() {
    if (!listening || !recorderRef.current) return;
    setListening(false);
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setTranscribing(true);
    try {
      const blob = await recorder.stop();
      if (blob.size === 0) throw new Error("No audio captured — try holding the button a little longer.");
      // Real Groq Whisper transcription (Voice Agent, spoken-input half).
      const { transcript: text } = await voiceApi.transcribe(blob);
      setTranscript(text);
    } catch (e) {
      setMicError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Couldn't transcribe that — is the backend running?");
    } finally {
      setTranscribing(false);
    }
  }

  // Simulates the student completing a homework activity: the Quiz Agent
  // grades it instantly and the Progress Agent explains any mistakes by
  // the concept the homework was actually testing.
  async function completeHomework(hw: Homework) {
    if (!active) return;
    const { correctCount, mistakes, submissionId } = simulateHomeworkGrading(hw);
    const submission: HomeworkSubmission = {
      id: submissionId,
      homeworkId: hw.id,
      studentId: active.id,
      correctCount,
      totalQuestions: hw.totalQuestions,
      mistakes,
      completedAt: new Date().toISOString(),
    };
    setSubmissions(prev => [...prev, submission]);
    await sync.enqueue("homework.submit", {
      homework_id: hw.id,
      student_id: String(active.id),
      correct_count: correctCount,
      total_questions: hw.totalQuestions,
      mistakes,
      marked_offline: sync.isOffline,
    });
  }

  if (!active) {
    return (
      <div className="max-w-4xl mx-auto px-5 md:px-8 py-14">
        <div className="text-center mb-10">
          <Eyebrow>Shared device · No password needed</Eyebrow>
          <h1 style={{ fontFamily: "'Fraunces', serif", color: T.cream, fontWeight: 600 }} className="text-3xl mb-2">{L.whosLearning}</h1>
          <p className="text-sm" style={{ color: T.chalk, opacity: 0.75 }}>{L.tapPicture}</p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 max-w-xl mx-auto">
          {roster.map(s => (
            <button key={s.id} onClick={() => setActive(s)} className="flex flex-col items-center gap-2 group">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold transition-transform group-hover:scale-105" style={{ background: s.avatarColor, color: T.bg }}>
                {s.name[0]}
              </div>
              <span className="text-xs font-medium" style={{ color: T.cream }}>{s.name}</span>
              <span className="text-[10px]" style={{ color: T.chalk, opacity: 0.6 }}>Grade {s.grade}</span>
            </button>
          ))}
          {addingChild ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center border-2 border-dashed" style={{ borderColor: T.marigold }}>
                <span style={{ color: T.marigoldSoft }} className="text-xl">+</span>
              </div>
              <input
                autoFocus
                value={childName}
                onChange={e => setChildName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddChild()}
                onBlur={handleAddChild}
                placeholder="Name"
                className="w-20 text-center text-[11px] rounded-lg px-1.5 py-1 outline-none"
                style={{ background: "rgba(0,0,0,0.25)", color: T.cream, border: `1px solid ${T.panelBorder}` }}
              />
            </div>
          ) : (
            <button onClick={() => setAddingChild(true)} className="flex flex-col items-center gap-2 justify-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center border-2 border-dashed" style={{ borderColor: T.panelBorder }}>
                <span style={{ color: T.chalk }} className="text-xl">+</span>
              </div>
              <span className="text-xs font-medium" style={{ color: T.chalk }}>{L.addChild}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => setActive(null)} className="text-xs font-semibold flex items-center gap-1" style={{ color: T.chalk }}>
          ← {L.switchProfile}
        </button>
        <div className="flex items-center gap-2">
          <Globe2 size={13} color={T.marigoldSoft} />
          <select value={lang} onChange={e => setLang(e.target.value as LangKey)} className="text-xs font-semibold rounded-lg px-2 py-1 outline-none" style={{ background: "rgba(0,0,0,0.2)", color: T.cream, border: `1px solid ${T.panelBorder}` }}>
            {(["Kannada", "Hindi", "English"] as LangKey[]).map(l => <option key={l} style={{ color: "#000" }}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold" style={{ background: active.avatarColor, color: T.bg }}>{active.name[0]}</div>
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", color: T.cream }} className="text-xl font-semibold">Hi {active.name}!</div>
          <div className="text-xs" style={{ color: T.chalk, opacity: 0.7 }}>Grade {active.grade} · learning in {lang} · 🔥 {active.streak}-day streak</div>
        </div>
        {!online && <Pill tone="warn"><CloudOff size={10} /> offline — saved on device</Pill>}
      </div>

      {/* PENDING HOMEWORK — front and centre so it can't be missed */}
      {(() => {
        const gradeHomework = homeworkList.filter(h => h.grade === "all" || h.grade === active.grade);
        const mySubs = submissions.filter(s => s.studentId === active.id);
        const pending = gradeHomework.filter(h => !mySubs.some(s => s.homeworkId === h.id));
        const completed = gradeHomework
          .map(h => ({ h, sub: mySubs.find(s => s.homeworkId === h.id) }))
          .filter((x): x is { h: Homework; sub: HomeworkSubmission } => !!x.sub)
          .sort((a, b) => b.sub.completedAt.localeCompare(a.sub.completedAt));

        return (
          <Card className="p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList size={16} color={T.marigold} />
              <span className="text-sm font-semibold" style={{ color: T.cream }}>My homework</span>
              {pending.length > 0 && <Pill tone="warn">{pending.length} pending</Pill>}
            </div>

            {pending.length === 0 && completed.length === 0 && (
              <p className="text-xs" style={{ color: T.chalk, opacity: 0.6 }}>No homework yet — check back after your teacher assigns some.</p>
            )}

            {pending.length > 0 && (
              <div className="space-y-2 mb-4">
                {pending.map(h => {
                  const subj = SUBJECTS.find(s => s.id === h.subjectId)!;
                  const Icon = subj.icon;
                  return (
                    <div key={h.id} className="flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: "rgba(232,169,58,0.1)" }}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon size={14} color={subj.color} className="shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate" style={{ color: T.cream }}>{h.title}</div>
                          <div className="text-[10px] truncate" style={{ color: T.chalk, opacity: 0.65 }}>{subj.name} · due {h.dueDate} · {h.instructions}</div>
                        </div>
                      </div>
                      <button onClick={() => completeHomework(h)}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                        style={{ background: T.marigold, color: T.bg }}>
                        Mark done
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {completed.length > 0 && (
              <div className="pt-3" style={{ borderTop: pending.length > 0 ? `1px solid ${T.panelBorder}` : "none" }}>
                <div className="text-[11px] font-semibold mb-2" style={{ color: T.chalk }}>Completed</div>
                <div className="space-y-2">
                  {completed.map(({ h, sub }) => {
                    const pct = Math.round((sub.correctCount / sub.totalQuestions) * 100);
                    return (
                      <div key={sub.id} className="p-3 rounded-xl" style={{ background: "rgba(0,0,0,0.18)" }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold" style={{ color: T.cream }}>{h.title}</span>
                          <span className="text-xs font-semibold flex items-center gap-1" style={{ color: pct >= 80 ? T.green2 : pct >= 50 ? T.marigoldSoft : T.danger }}>
                            <Trophy size={11} /> {sub.correctCount}/{sub.totalQuestions}
                          </span>
                        </div>
                        {sub.mistakes.length === 0 ? (
                          <p className="text-[11px]" style={{ color: T.green2 }}>Full marks — great work!</p>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-[11px]" style={{ color: T.chalk, opacity: 0.75 }}>Where you went wrong:</p>
                            {sub.mistakes.map((m, i) => (
                              <p key={i} className="text-[11px]" style={{ color: T.chalk }}>
                                <span className="font-semibold" style={{ color: T.danger }}>{m.topic}:</span> {m.note}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        );
      })()}

      {/* REAL QUIZ — from the actual Quiz Agent, only shown once a lesson has
          been generated for this student's grade on the Live Agents tab. */}
      {(() => {
        const quizForGrade = lastGenerated?.quizzes[String(active.grade)];
        const conceptId = lastGenerated?.lesson.concept_id as string | undefined;
        if (!quizForGrade || !conceptId) return null;
        return (
          <Card className="p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Target size={16} color={T.marigold} />
              <span className="text-sm font-semibold" style={{ color: T.cream }}>Quick check — {conceptId}</span>
              <Pill tone="live">Live from Quiz Agent</Pill>
            </div>
            <RealQuizPanel key={quizForGrade.quiz_id} studentId={String(active.id)} quizId={quizForGrade.quiz_id} conceptId={conceptId} />
          </Card>
        );
      })()}

      {/* PARENT UPDATE — real Parent Communication Agent + spoken via the
          browser's Web Speech API in the parent's chosen language. */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Heart size={16} color={T.indigo} />
          <span className="text-sm font-semibold" style={{ color: T.cream }}>Update for {active.name}&apos;s family</span>
        </div>
        <ParentUpdateButton studentId={String(active.id)} studentName={active.name} parentLanguage={langKeyToCode(lang)} />
      </Card>

      {/* STUDY MATERIAL — 5 subjects, switch language when a lesson doesn't make sense */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <BookMarked size={16} color={T.indigo} />
          <span className="text-sm font-semibold" style={{ color: T.cream }}>Study material</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {SUBJECTS.map(s => {
            const Icon = s.icon;
            const count = materials.filter(m => m.subjectId === s.id && m.grade === active.grade).length;
            const isOpen = openSubject === s.id;
            return (
              <button key={s.id} onClick={() => setOpenSubject(isOpen ? null : s.id)}
                className="flex items-center gap-2 p-3 rounded-xl text-left transition-colors"
                style={{ background: isOpen ? `${s.color}20` : "rgba(246,240,228,0.05)", border: `1px solid ${isOpen ? s.color : T.panelBorder}` }}>
                <Icon size={15} color={s.color} className="shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: T.cream }}>{s.name}</div>
                  <div className="text-[10px]" style={{ color: T.chalk, opacity: 0.6 }}>{count} lesson{count === 1 ? "" : "s"}</div>
                </div>
              </button>
            );
          })}
        </div>

        {openSubject && (
          <div className="pt-3 space-y-3" style={{ borderTop: `1px solid ${T.panelBorder}` }}>
            {materials.filter(m => m.subjectId === openSubject && m.grade === active.grade).length === 0 && (
              <p className="text-xs" style={{ color: T.chalk, opacity: 0.6 }}>No material for Grade {active.grade} in this subject yet.</p>
            )}
            {materials.filter(m => m.subjectId === openSubject && m.grade === active.grade).map(m => {
              const mLang = materialLang[m.id] || lang;
              return (
                <div key={m.id} className="p-3.5 rounded-xl" style={{ background: "rgba(0,0,0,0.18)" }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold" style={{ color: T.cream }}>{m.title}</span>
                    <div className="flex gap-1 shrink-0">
                      {(["Kannada", "Hindi", "English"] as LangKey[]).map(l => (
                        <button key={l} onClick={() => setMaterialLang(prev => ({ ...prev, [m.id]: l }))}
                          className="px-2 py-1 rounded-md text-[10px] font-semibold"
                          style={{ background: mLang === l ? T.marigold : "rgba(246,240,228,0.08)", color: mLang === l ? T.bg : T.chalk }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs whitespace-pre-line leading-relaxed" style={{ color: T.chalk }}>{m.content[mLang]}</p>
                  <p className="text-[10px] mt-2" style={{ color: T.chalk, opacity: 0.5 }}>Not understanding this? Tap another language above.</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Volume2 size={16} color={T.marigold} />
            <span className="text-sm font-semibold" style={{ color: T.cream }}>Today&apos;s lesson</span>
          </div>
          <p className="text-sm mb-4" style={{ color: T.chalk }}>&quot;{L.lessonTag}&quot; {L.lessonDesc}</p>
          <button
            onClick={handlePlayVoice}
            disabled={playing}
            className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-opacity"
            style={{ background: T.marigold, color: T.bg, opacity: playing ? 0.7 : 1, cursor: playing ? "default" : "pointer" }}>
            {playing ? <><Volume2 size={13} /> {L.playing}</> : <><Play size={13} /> {L.playVoice}</>}
          </button>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mic size={16} color={T.clay} />
            <span className="text-sm font-semibold" style={{ color: T.cream }}>Ask GURU a question</span>
          </div>
          <p className="text-xs mb-4" style={{ color: T.chalk, opacity: 0.75 }}>{L.askHint}</p>
          <button
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onMouseLeave={() => listening && stopListening()}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            disabled={transcribing}
            className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-colors select-none"
            style={{ borderColor: T.clay, color: listening ? T.bg : T.clay, background: listening ? T.clay : "transparent", opacity: transcribing ? 0.7 : 1 }}>
            <Mic size={13} /> {listening ? L.listening : transcribing ? "Transcribing…" : L.holdSpeak}
          </button>
          {transcript && <p className="text-[11px] mt-3 italic" style={{ color: T.chalk }}>You said: &quot;{transcript}&quot;</p>}
          {micError && <p className="text-[11px] mt-3" style={{ color: T.danger }}>{micError}</p>}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target size={16} color={T.indigo} />
          <span className="text-sm font-semibold" style={{ color: T.cream }}>Quick check</span>
          <Pill tone="gold">adaptive</Pill>
        </div>
        <p className="text-sm mb-4" style={{ color: T.cream }}>{L.quizQuestion}</p>
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "4"].map(opt => (
            <button key={opt} onClick={() => setQuizAnswered(opt)}
              className="py-3 rounded-xl text-sm font-semibold transition-colors"
              style={{
                background: quizAnswered === opt ? (opt === "2" ? "rgba(127,168,147,0.25)" : "rgba(217,112,92,0.25)") : "rgba(246,240,228,0.06)",
                color: quizAnswered === opt ? (opt === "2" ? T.green2 : T.danger) : T.cream,
                border: `1px solid ${T.panelBorder}`,
              }}>
              {opt}
            </button>
          ))}
        </div>
        {quizAnswered && (
          <p className="text-xs mt-3" style={{ color: quizAnswered === "2" ? T.green2 : T.danger }}>
            {quizAnswered === "2" ? L.correctMsg : L.incorrectMsg}
          </p>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AGENT ARCHITECTURE                                                   */
/* ------------------------------------------------------------------ */
function AgentArchitecture() {
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const ring = agents.filter(a => a.name !== "Orchestrator Agent");

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-12">
      <SectionTitle eyebrow="System design" title="The multi-agent pipeline" color={T.indigo}
        sub="Every request — a teacher's upload, a student's voice question, a nightly sync — flows through the Orchestrator, which delegates to specialists and merges their responses." />

      <div className="grid lg:grid-cols-[1.1fr,0.9fr] gap-8">
        <Card className="p-6">
          <div className="relative flex items-center justify-center" style={{ minHeight: 460 }}>
            <button onClick={() => setActiveAgent(null)}
              className="absolute z-10 w-28 h-28 rounded-full flex flex-col items-center justify-center text-center gap-1 transition-transform hover:scale-105"
              style={{ background: T.marigold, color: T.bg }}>
              <Network size={20} />
              <span className="text-[11px] font-bold leading-tight px-2">Orchestrator</span>
            </button>
            {ring.map((a, i) => {
              const angle = (i / ring.length) * 2 * Math.PI - Math.PI / 2;
              const r = 175;
              const x = Math.cos(angle) * r;
              const y = Math.sin(angle) * r;
              const Icon = a.icon;
              const active = activeAgent?.name === a.name;
              return (
                <React.Fragment key={a.name}>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                    <line x1="50%" y1="50%" x2={`calc(50% + ${x}px)`} y2={`calc(50% + ${y}px)`}
                      stroke={active ? a.color : T.panelBorder} strokeWidth={active ? 2 : 1} />
                  </svg>
                  <button
                    onClick={() => setActiveAgent(a)}
                    className="absolute w-[84px] h-[84px] rounded-2xl flex flex-col items-center justify-center gap-1 text-center transition-all duration-200"
                    style={{
                      transform: `translate(${x}px, ${y}px)`,
                      background: active ? `${a.color}26` : "rgba(246,240,228,0.05)",
                      border: `1px solid ${active ? a.color : T.panelBorder}`,
                    }}>
                    <Icon size={16} color={a.color} />
                    <span className="text-[9.5px] font-semibold leading-tight px-1" style={{ color: T.cream }}>{a.name.replace(" Agent", "")}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          {activeAgent ? (
            <div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${activeAgent.color}22` }}>
                <activeAgent.icon size={18} color={activeAgent.color} />
              </div>
              <h3 style={{ fontFamily: "'Fraunces', serif", color: T.cream }} className="text-xl font-semibold mb-2">{activeAgent.name}</h3>
              <p className="text-sm leading-relaxed" style={{ color: T.chalk, opacity: 0.85 }}>{activeAgent.role}</p>
              <div className="mt-5 pt-5 text-xs" style={{ borderTop: `1px solid ${T.panelBorder}`, color: T.chalk, opacity: 0.6 }}>
                Communicates with the Orchestrator over an internal LangGraph message bus; state is
                persisted so this agent can resume mid-task after a connectivity drop.
              </div>
            </div>
          ) : (
            <div>
              <h3 style={{ fontFamily: "'Fraunces', serif", color: T.cream }} className="text-xl font-semibold mb-2">Orchestrator Agent</h3>
              <p className="text-sm leading-relaxed mb-4" style={{ color: T.chalk, opacity: 0.85 }}>
                The single entry point for every request. It classifies intent, plans a sequence of
                agent calls via LangGraph, runs independent agents in parallel where possible, and
                merges results into one response — while writing every state change to the local
                offline-first store first.
              </p>
              <p className="text-xs" style={{ color: T.marigoldSoft }}>Tap any agent in the diagram to see its role →</p>
            </div>
          )}
          <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${T.panelBorder}` }}>
            <div className="text-xs font-semibold mb-3" style={{ color: T.chalk }}>Example flow: teacher uploads a blackboard photo</div>
            <div className="space-y-2">
              {["OCR extracts handwritten text", "Lesson Agent builds Grade 1–5 versions", "Language Agent translates to Kannada + Hindi", "Voice Agent renders spoken explanations", "Quiz Agent drafts adaptive questions", "Offline Sync Agent queues it for every device"].map((step, i) => (
                <div key={step} className="flex items-center gap-2.5 text-xs" style={{ color: T.chalk }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold text-[10px]" style={{ background: "rgba(232,169,58,0.18)", color: T.marigoldSoft }}>{i + 1}</span>
                  {step}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LIVE AGENTS — talks to the real FastAPI backend (see /backend).    */
/*  Not mock data: this fires an actual Orchestrator run. The timing   */
/*  numbers shown after generation are the real per-agent wall-clock   */
/*  times returned by the backend, proving the agents that don't       */
/*  depend on each other's output genuinely ran concurrently.          */
/* ------------------------------------------------------------------ */
const AGENT_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  lesson_agent: { label: "Lesson Agent", icon: BookOpen, color: T.green2 },
  language_agent: { label: "Language Agent", icon: Languages, color: T.indigo },
  community_knowledge_agent: { label: "Community Knowledge Agent", icon: Sprout, color: T.clay },
};
function quizAgentMeta(grade: string) {
  return { label: `Quiz Agent (Grade ${grade})`, icon: Target, color: T.marigoldSoft };
}

function LiveAgentDemo({ onGenerated }: { onGenerated: (res: GenerateLessonResponse) => void }) {
  const [connected, setConnected] = useState<boolean>(() => !!getToken());
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [subject, setSubject] = useState("Mathematics");
  const [conceptId, setConceptId] = useState("math.fractions.intro");
  const [sourceText, setSourceText] = useState(
    "Fractions show a part of a whole. If we cut a roti into 4 equal pieces and eat 1 piece, we ate 1/4 (one-fourth) of the roti."
  );
  const [grades, setGrades] = useState<number[]>([2, 4]);
  const [languages, setLanguages] = useState<string[]>(["kn", "hi"]);
  const [useVillage, setUseVillage] = useState(true);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateLessonResponse | null>(null);

  const connectToBackend = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      // Demo teacher created by `python -m app.seed` — see OFFLINE_SYNC_README.md
      const { access_token } = await authApi.login("teacher@guru.ai", "password123");
      setToken(access_token);
      setConnected(true);
    } catch (e) {
      setConnectError(
        e instanceof ApiError
          ? `Backend responded but login failed: ${e.message}`
          : "Couldn't reach the backend. Is it running at NEXT_PUBLIC_API_URL (default http://localhost:8000)?"
      );
    } finally {
      setConnecting(false);
    }
  }, []);

  const toggleGrade = (g: number) => setGrades((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g].sort()));
  const toggleLang = (l: string) => setLanguages((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const runOrchestrator = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await lessonsApi.generate({
        subject,
        concept_id: conceptId,
        source_text: sourceText,
        grades,
        languages,
        village_id: useVillage ? "chintamani_apmc" : null,
        generate_quiz: true,
      });
      setResult(res);
      onGenerated(res);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 503
            ? `${e.message} (this is expected until GROQ_API_KEY is set in backend/.env)`
            : e.message
          : "Request failed — check the backend is running and reachable."
      );
    } finally {
      setRunning(false);
    }
  }, [subject, conceptId, sourceText, grades, languages, useVillage, onGenerated]);

  const agentKeys = result ? Object.keys(result.agent_timings_ms) : [];
  const maxMs = result ? Math.max(...Object.values(result.agent_timings_ms), 1) : 1;

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-10">
      <SectionTitle
        eyebrow="Real Orchestrator Run"
        title="Live Agents"
        sub="This calls the actual FastAPI backend. Lesson Agent runs first, then Language, Quiz, and Community Knowledge agents fire concurrently — the timings below are real, not staged."
        color={T.marigold}
      />

      {!connected ? (
        <Card className="p-6 mb-6">
          <p className="text-sm mb-3" style={{ color: T.chalk }}>
            Connect to the backend first (uses the demo teacher account created by <code>python -m app.seed</code>).
          </p>
          <button
            onClick={connectToBackend}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: T.marigold, color: T.bg }}
          >
            {connecting ? <RefreshCw size={14} className="animate-spin" /> : <Radio size={14} />}
            {connecting ? "Connecting…" : "Connect to backend"}
          </button>
          {connectError && (
            <p className="mt-3 text-xs flex items-start gap-1.5" style={{ color: T.danger }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {connectError}
            </p>
          )}
        </Card>
      ) : (
        <>
          <Card className="p-6 mb-6">
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: T.chalk }}>Subject</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(0,0,0,0.2)", color: T.cream, border: `1px solid ${T.panelBorder}` }} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: T.chalk }}>Concept ID</label>
                <input value={conceptId} onChange={(e) => setConceptId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={{ background: "rgba(0,0,0,0.2)", color: T.cream, border: `1px solid ${T.panelBorder}` }} />
              </div>
            </div>

            <label className="text-xs font-semibold mb-1.5 block" style={{ color: T.chalk }}>
              Source material (imagine this came from OCR on a textbook or blackboard photo)
            </label>
            <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm mb-4" style={{ background: "rgba(0,0,0,0.2)", color: T.cream, border: `1px solid ${T.panelBorder}` }} />

            <div className="flex flex-wrap gap-6 mb-5">
              <div>
                <span className="text-xs font-semibold mb-1.5 block" style={{ color: T.chalk }}>Grades</span>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((g) => (
                    <button key={g} onClick={() => toggleGrade(g)}
                      className="w-8 h-8 rounded-lg text-xs font-bold"
                      style={{ background: grades.includes(g) ? T.marigold : "rgba(0,0,0,0.2)", color: grades.includes(g) ? T.bg : T.chalk }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold mb-1.5 block" style={{ color: T.chalk }}>Languages</span>
                <div className="flex gap-1.5">
                  {["en", "kn", "hi", "ta"].map((l) => (
                    <button key={l} onClick={() => toggleLang(l)}
                      className="px-2.5 h-8 rounded-lg text-xs font-bold uppercase"
                      style={{ background: languages.includes(l) ? T.indigo : "rgba(0,0,0,0.2)", color: languages.includes(l) ? T.cream : T.chalk }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold mb-1.5 block" style={{ color: T.chalk }}>Community Knowledge Agent</span>
                <button onClick={() => setUseVillage((v) => !v)}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold"
                  style={{ background: useVillage ? "rgba(193,101,47,0.25)" : "rgba(0,0,0,0.2)", color: useVillage ? T.clay : T.chalk }}>
                  <Sprout size={13} /> {useVillage ? "On (Chintamani APMC village)" : "Off"}
                </button>
              </div>
            </div>

            <button
              onClick={runOrchestrator}
              disabled={running || grades.length === 0 || !sourceText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
              style={{ background: T.marigold, color: T.bg }}
            >
              {running ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
              {running ? "Orchestrator running…" : "Run the Orchestrator"}
            </button>

            {error && (
              <p className="mt-3 text-xs flex items-start gap-1.5" style={{ color: T.danger }}>
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
              </p>
            )}
          </Card>

          {result && (
            <div className="space-y-6">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <Eyebrow color={T.green2}><Check size={12} /> Pipeline complete</Eyebrow>
                  <div className="flex gap-2 flex-wrap">
                    <Pill tone="live">Total wall-clock: {result.total_wall_clock_ms}ms</Pill>
                    <Pill tone="gold">Sum of agent time: {result.sum_of_agent_ms}ms</Pill>
                    {result.parallelism_saved_ms > 0 && (
                      <Pill tone="warn">Saved {result.parallelism_saved_ms}ms by running in parallel</Pill>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {agentKeys.map((key) => {
                    const meta = key.startsWith("quiz_agent_grade_")
                      ? quizAgentMeta(key.replace("quiz_agent_grade_", ""))
                      : AGENT_META[key] ?? { label: key, icon: Network, color: T.chalk };
                    const Icon = meta.icon;
                    const ms = result.agent_timings_ms[key];
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <div className="w-44 shrink-0 flex items-center gap-1.5 text-xs font-semibold" style={{ color: T.cream }}>
                          <Icon size={13} color={meta.color} /> {meta.label}
                        </div>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.25)" }}>
                          <div className="h-full rounded-full" style={{ width: `${(ms / maxMs) * 100}%`, background: meta.color }} />
                        </div>
                        <span className="w-14 text-right text-xs font-mono" style={{ color: T.chalk }}>{ms}ms</span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="p-6">
                <Eyebrow color={T.marigold}><BookOpen size={12} /> Lesson Agent output</Eyebrow>
                <h3 className="text-lg font-semibold mb-1" style={{ fontFamily: "'Fraunces', serif", color: T.cream }}>
                  {String(result.lesson.title ?? "")}
                </h3>
                <p className="text-sm mb-4" style={{ color: T.chalk, opacity: 0.85 }}>{String(result.lesson.concept_summary ?? "")}</p>
                <div className="grid md:grid-cols-2 gap-4">
                  {Object.entries((result.lesson.grade_versions as Record<string, { explanation: string; example: string }>) ?? {}).map(
                    ([grade, content]) => (
                      <div key={grade} className="p-4 rounded-xl" style={{ background: "rgba(0,0,0,0.15)" }}>
                        <Pill>Grade {grade}</Pill>
                        <p className="text-sm mt-2" style={{ color: T.cream }}>{content.explanation}</p>
                        <p className="text-xs mt-2 italic" style={{ color: T.chalk }}>e.g. {content.example}</p>
                      </div>
                    )
                  )}
                </div>
              </Card>

              {!!Object.keys(result.lesson.translations ?? {}).length && (
                <Card className="p-6">
                  <Eyebrow color={T.indigo}><Languages size={12} /> Language Agent output</Eyebrow>
                  <div className="grid md:grid-cols-2 gap-4 mt-2">
                    {Object.entries(result.lesson.translations as Record<string, { title: string; grade_versions: Record<string, { explanation: string }> }>).map(
                      ([lang, t]) => (
                        <div key={lang} className="p-4 rounded-xl" style={{ background: "rgba(0,0,0,0.15)" }}>
                          <div className="flex items-center justify-between mb-1">
                            <Pill tone="gold">{lang.toUpperCase()}</Pill>
                            {isSpeechSynthesisAvailable() && (
                              <button
                                onClick={() => {
                                  const firstGrade = Object.values(t.grade_versions ?? {})[0];
                                  if (firstGrade) speak(firstGrade.explanation, lang);
                                }}
                                className="flex items-center gap-1 text-xs font-semibold"
                                style={{ color: T.marigoldSoft }}
                                title="Speak aloud via browser TTS (Voice Agent, client-side)"
                              >
                                <Volume2 size={13} /> Speak
                              </button>
                            )}
                          </div>
                          <p className="text-sm font-medium" style={{ color: T.cream }}>{t.title}</p>
                          {Object.entries(t.grade_versions ?? {}).map(([grade, gv]) => (
                            <p key={grade} className="text-xs mt-1.5" style={{ color: T.chalk }}>
                              <span className="font-semibold">G{grade}:</span> {gv.explanation}
                            </p>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </Card>
              )}

              {!!Object.keys(result.quizzes).length && (
                <Card className="p-6">
                  <Eyebrow color={T.marigoldSoft}><Target size={12} /> Quiz Agent output</Eyebrow>
                  <div className="grid md:grid-cols-2 gap-4 mt-2">
                    {Object.entries(result.quizzes).map(([grade, quiz]) => (
                      <div key={grade} className="p-4 rounded-xl" style={{ background: "rgba(0,0,0,0.15)" }}>
                        <Pill>Grade {grade} · {quiz.questions.length} questions</Pill>
                        {(quiz.questions as { prompt: string; difficulty: string }[]).slice(0, 2).map((q, i) => (
                          <p key={i} className="text-xs mt-2" style={{ color: T.cream }}>
                            <span className="font-mono" style={{ color: T.chalk }}>[{q.difficulty}]</span> {q.prompt}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {result.localization && (result.localization.localized_examples as unknown[])?.length > 0 && (
                <Card className="p-6">
                  <Eyebrow color={T.clay}><Sprout size={12} /> Community Knowledge Agent output</Eyebrow>
                  <div className="space-y-2 mt-2">
                    {(result.localization.localized_examples as { grade: string; generic_example: string; localized_example: string }[]).map(
                      (ex, i) => (
                        <div key={i} className="p-3 rounded-xl text-xs" style={{ background: "rgba(0,0,0,0.15)" }}>
                          <span className="font-semibold" style={{ color: T.chalk }}>Grade {ex.grade} — generic:</span>{" "}
                          <span style={{ color: T.chalk, opacity: 0.7 }}>{ex.generic_example}</span>
                          <br />
                          <span className="font-semibold" style={{ color: T.clay }}>Localized:</span>{" "}
                          <span style={{ color: T.cream }}>{ex.localized_example}</span>
                        </div>
                      )
                    )}
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/*  REAL ADAPTIVE QUIZ — wired to the actual Quiz + Progress agents,    */
/*  not the simulated homework flow above. Escalates difficulty on a    */
/*  correct answer, drops back down on a miss, and every answer really  */
/*  updates the student's mastery score in MongoDB via the Progress     */
/*  Agent's /api/quizzes/{id}/attempt endpoint.                         */
/* ------------------------------------------------------------------ */
type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  difficulty: "easy" | "medium" | "hard";
};

const DIFFICULTY_ORDER: QuizQuestion["difficulty"][] = ["easy", "medium", "hard"];

function RealQuizPanel({ studentId, quizId, conceptId }: { studentId: string; quizId: string; conceptId: string }) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);
  const [tierIndex, setTierIndex] = useState(0); // index into DIFFICULTY_ORDER
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [masteryScore, setMasteryScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    quizzesApi
      .get(quizId)
      .then((doc) => {
        if (cancelled) return;
        setQuestions((doc as { questions?: QuizQuestion[] }).questions ?? []);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof ApiError ? e.message : "Couldn't load the quiz — is the backend running?");
      });
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  if (loadError) return <p className="text-xs" style={{ color: T.danger }}>{loadError}</p>;
  if (!questions) return <p className="text-xs" style={{ color: T.chalk, opacity: 0.6 }}>Loading quiz…</p>;

  const remaining = questions.filter((q) => !answeredIds.includes(q.id));

  if (remaining.length === 0) {
    return (
      <div className="p-4 rounded-xl text-center" style={{ background: "rgba(127,168,147,0.12)" }}>
        <Trophy size={20} color={T.green2} className="mx-auto mb-2" />
        <p className="text-sm font-semibold" style={{ color: T.cream }}>Quiz complete!</p>
        {masteryScore !== null && (
          <p className="text-xs mt-1" style={{ color: T.chalk }}>Updated mastery on {conceptId}: {masteryScore.toFixed(0)}/100 (real write to MongoDB)</p>
        )}
      </div>
    );
  }

  // Prefer a question at the current difficulty tier; otherwise walk
  // outward to the nearest tier that still has unanswered questions.
  const pickNext = (): QuizQuestion => {
    for (let offset = 0; offset < DIFFICULTY_ORDER.length; offset++) {
      const candidates = offset === 0 ? [tierIndex] : [tierIndex + offset, tierIndex - offset];
      for (const idx of candidates) {
        if (idx < 0 || idx >= DIFFICULTY_ORDER.length) continue;
        const match = remaining.find((q) => q.difficulty === DIFFICULTY_ORDER[idx]);
        if (match) return match;
      }
    }
    return remaining[0];
  };

  const current = pickNext();

  async function answer(optionIndex: number) {
    if (selected !== null || submitting) return;
    setSelected(optionIndex);
    const correct = optionIndex === current.correct_index;
    setFeedback(correct ? "correct" : "wrong");
    setSubmitting(true);
    try {
      const { new_score } = await quizzesApi.submitAttempt(quizId, {
        student_id: studentId,
        concept_id: conceptId,
        question_index: questions!.indexOf(current),
        correct,
      });
      setMasteryScore(new_score);
    } catch {
      // Real mastery write failed (e.g. backend unreachable) — the quiz
      // still progresses locally so the student isn't blocked, but the
      // score shown afterwards won't reflect an actual MongoDB update.
    } finally {
      setSubmitting(false);
    }
    setTimeout(() => {
      setAnsweredIds((prev) => [...prev, current.id]);
      setTierIndex((prev) => Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, correct ? prev + 1 : prev - 1)));
      setSelected(null);
      setFeedback(null);
    }, 900);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Pill tone={current.difficulty === "hard" ? "warn" : current.difficulty === "medium" ? "gold" : "default"}>{current.difficulty}</Pill>
        <span className="text-[10px]" style={{ color: T.chalk, opacity: 0.6 }}>{answeredIds.length + 1} of {questions.length}</span>
      </div>
      <p className="text-sm font-medium mb-3" style={{ color: T.cream }}>{current.prompt}</p>
      <div className="space-y-2">
        {current.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrectOpt = i === current.correct_index;
          let bg = "rgba(246,240,228,0.06)";
          if (selected !== null && isCorrectOpt) bg = "rgba(127,168,147,0.25)";
          else if (isSelected && !isCorrectOpt) bg = "rgba(217,112,92,0.25)";
          return (
            <button
              key={i}
              disabled={selected !== null}
              onClick={() => answer(i)}
              className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-colors"
              style={{ background: bg, color: T.cream, border: `1px solid ${T.panelBorder}` }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {feedback && (
        <p className="text-xs mt-3 font-semibold" style={{ color: feedback === "correct" ? T.green2 : T.danger }}>
          {feedback === "correct" ? "Correct — next one's a bit harder." : "Not quite — let's try an easier one."}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TEACHER INSIGHTS — real calls to the Planner and Peer Learning      */
/*  agents. An empty result just means no real quiz attempts have been  */
/*  recorded yet (see RealQuizPanel above) — not a bug.                 */
/* ------------------------------------------------------------------ */
function TeacherInsightsPanel({ roster, conceptId }: { roster: Student[]; conceptId: string | null }) {
  const [plan, setPlan] = useState<{ concept_id: string; blocked_student_count: number }[] | null>(null);
  const [pairs, setPairs] = useState<{ stronger_student_id: string; weaker_student_id: string; gap: number }[] | null>(null);
  const [loading, setLoading] = useState<"plan" | "pairs" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const studentIds = roster.map((s) => String(s.id));
  const nameFor = (id: string) => roster.find((s) => String(s.id) === id)?.name ?? id;

  async function loadPlan() {
    setLoading("plan");
    setErr(null);
    try {
      const res = await classroomsApi.planTomorrow(studentIds);
      setPlan(res.priority_concepts_tomorrow as { concept_id: string; blocked_student_count: number }[]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't reach the Planner Agent — is the backend running?");
    } finally {
      setLoading(null);
    }
  }

  async function loadPairs() {
    if (!conceptId) {
      setErr("Run the Orchestrator on the Live Agents tab first, so there's a concept to pair students on.");
      return;
    }
    setLoading("pairs");
    setErr(null);
    try {
      const res = await classroomsApi.peerPairs(conceptId, studentIds);
      setPairs(res.suggested_pairs as { stronger_student_id: string; weaker_student_id: string; gap: number }[]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't reach the Peer Learning Agent — is the backend running?");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Brain size={16} color={T.indigo} />
        <span className="text-sm font-semibold" style={{ color: T.cream }}>Teacher insights (Planner + Peer Learning agents)</span>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={loadPlan} disabled={loading !== null} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: T.marigold, color: T.bg }}>
          {loading === "plan" ? "Thinking…" : "What should I focus on tomorrow?"}
        </button>
        <button
          onClick={loadPairs}
          disabled={loading !== null}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
          style={{ background: "rgba(246,240,228,0.1)", color: T.cream, border: `1px solid ${T.panelBorder}` }}
        >
          {loading === "pairs" ? "Pairing…" : "Suggest peer pairs"}
        </button>
      </div>
      {err && <p className="text-xs mb-3" style={{ color: T.danger }}>{err}</p>}

      {plan && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold mb-2" style={{ color: T.chalk }}>Ranked by how many students are stuck:</p>
          {plan.length === 0 ? (
            <p className="text-xs" style={{ color: T.chalk, opacity: 0.6 }}>No concepts flagged yet — students haven&apos;t answered any real quiz questions.</p>
          ) : (
            plan.map((p) => (
              <div key={p.concept_id} className="flex items-center justify-between p-2.5 rounded-lg mb-1.5" style={{ background: "rgba(0,0,0,0.18)" }}>
                <span className="text-xs font-medium" style={{ color: T.cream }}>{p.concept_id}</span>
                <Pill tone="warn">{p.blocked_student_count} blocked</Pill>
              </div>
            ))
          )}
        </div>
      )}

      {pairs && (
        <div>
          <p className="text-[11px] font-semibold mb-2" style={{ color: T.chalk }}>Suggested study buddies on {conceptId}:</p>
          {pairs.length === 0 ? (
            <p className="text-xs" style={{ color: T.chalk, opacity: 0.6 }}>No large enough gap found between any two students on this concept yet.</p>
          ) : (
            pairs.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg mb-1.5" style={{ background: "rgba(0,0,0,0.18)" }}>
                <span className="text-xs" style={{ color: T.cream }}>{nameFor(p.stronger_student_id)} ↔ {nameFor(p.weaker_student_id)}</span>
                <span className="text-[10px]" style={{ color: T.chalk, opacity: 0.6 }}>gap {p.gap.toFixed(0)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  PARENT UPDATE — real call to the Parent Communication Agent        */
/*  (Progress Agent's Digital Twin + Language Agent's translation),    */
/*  spoken client-side via the Web Speech API (Voice Agent, TTS half). */
/* ------------------------------------------------------------------ */
function ParentUpdateButton({ studentId, studentName, parentLanguage }: { studentId: string; studentName: string; parentLanguage: "kn" | "hi" | "en" }) {
  const [loading, setLoading] = useState(false);
  const [update, setUpdate] = useState<{ text_translated: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setErr(null);
    setUpdate(null);
    try {
      const res = await parentApi.generateUpdate(studentId, parentLanguage, studentName);
      setUpdate(res);
      if (isSpeechSynthesisAvailable()) speak(res.text_translated, parentLanguage);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't reach the Parent Communication Agent — is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={send}
        disabled={loading}
        className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
        style={{ background: T.indigo, color: T.cream }}
      >
        <Volume2 size={13} /> {loading ? "Preparing update…" : "Send spoken update to parent"}
      </button>
      {err && <p className="text-[11px] mt-2" style={{ color: T.danger }}>{err}</p>}
      {update && <p className="text-[11px] mt-2 italic" style={{ color: T.chalk }}>&quot;{update.text_translated}&quot;</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ROOT                                                                 */
/* ------------------------------------------------------------------ */
export default function GuruAI() {
  const [view, setView] = useState<ViewId>("overview");
  // `sync` is backed by a real IndexedDB queue + service worker + MongoDB
  // sync endpoint — see hooks/useOfflineSync.ts and lib/offline/*.
  const sync = useOfflineSync();
  const online = !sync.isOffline;
  const setOnline = useCallback(() => sync.setForcedOffline(online), [online, sync]);

  // Shared across Teacher Dashboard and Student Mode so a teacher's upload
  // or homework, and a student's completed activity, show up on both sides
  // instantly — this is the in-memory mirror of what the offline sync queue
  // eventually writes to MongoDB.
  const [materials, setMaterials] = useState<StudyMaterial[]>(INITIAL_MATERIALS);
  const [homeworkList, setHomeworkList] = useState<Homework[]>(INITIAL_HOMEWORK);
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>(INITIAL_SUBMISSIONS);
  // The real result of the last "Run the Orchestrator" click on the Live
  // Agents tab — this is what lets Teacher Dashboard and Student Mode use
  // actual lesson_id/quiz_id/concept_id from MongoDB instead of mock data.
  const [lastGenerated, setLastGenerated] = useState<GenerateLessonResponse | null>(null);

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <style>{`${fontFace}
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(246,240,228,0.15); border-radius: 4px; }
        select option { background: #1B382F; }
      `}</style>
      <TopNav view={view} setView={setView} online={online} setOnline={setOnline} sync={sync} />
      {view === "overview" && <Overview setView={setView} />}
      {view === "teacher" && (
        <TeacherDashboard
          online={online} sync={sync}
          materials={materials} setMaterials={setMaterials}
          homeworkList={homeworkList} setHomeworkList={setHomeworkList}
          submissions={submissions}
          lastGenerated={lastGenerated}
        />
      )}
      {view === "student" && (
        <StudentMode
          online={online}
          sync={sync}
          materials={materials}
          homeworkList={homeworkList}
          submissions={submissions}
          setSubmissions={setSubmissions}
          lastGenerated={lastGenerated}
        />
      )}
      {view === "agents" && <AgentArchitecture />}
      {view === "live" && <LiveAgentDemo onGenerated={setLastGenerated} />}

      <footer className="max-w-7xl mx-auto px-5 md:px-8 py-10 flex items-center justify-between text-xs" style={{ color: T.chalk, opacity: 0.5 }}>
        <span>GURU AI — Generative Unified Rural Education using Agentic Intelligence</span>
        <span>Demo build · sample data</span>
      </footer>
    </div>
  );
}