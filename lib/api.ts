/**
 * Minimal API client. Talks to the FastAPI backend (see /backend).
 * Set NEXT_PUBLIC_API_URL in .env.local — see .env.local.example.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "guru_ai_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* body wasn't JSON — keep statusText */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<{ access_token: string; user: Record<string, unknown> }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signup: (name: string, email: string, password: string) =>
    apiFetch<{ access_token: string; user: Record<string, unknown> }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
};

// ---------------------------------------------------------------- lessons
// Hits POST /api/lessons/generate, which triggers the Orchestrator:
// Lesson Agent runs first, then Language + Quiz(-per-grade) + Community
// Knowledge fire concurrently. agent_timings_ms in the response is real
// per-agent wall-clock time — useful to actually show in the demo UI.
export interface GenerateLessonRequest {
  subject: string;
  concept_id: string;
  source_text: string;
  grades?: number[];
  languages?: string[];
  village_id?: string | null;
  generate_quiz?: boolean;
}

export interface GenerateLessonResponse {
  lesson_id: string;
  lesson: Record<string, unknown>;
  quizzes: Record<string, { quiz_id: string; questions: unknown[] }>;
  localization: Record<string, unknown> | null;
  agent_timings_ms: Record<string, number>;
  total_wall_clock_ms: number;
  sum_of_agent_ms: number;
  parallelism_saved_ms: number;
}

export const lessonsApi = {
  generate: (body: GenerateLessonRequest) =>
    apiFetch<GenerateLessonResponse>("/api/lessons/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  get: (lessonId: string) => apiFetch<Record<string, unknown>>(`/api/lessons/${lessonId}`),
  list: () => apiFetch<Record<string, unknown>[]>("/api/lessons"),
};

// ---------------------------------------------------------------- quizzes
export const quizzesApi = {
  get: (quizId: string) => apiFetch<Record<string, unknown>>(`/api/quizzes/${quizId}`),
  // NOTE: quiz_id is required by the backend's QuizAttemptRequest model even
  // though it's also in the URL — omitting it previously caused every real
  // call to this endpoint to fail with a 422 before it ever reached Mongo.
  submitAttempt: (
    quizId: string,
    body: { student_id: string; concept_id: string; question_index: number; correct: boolean; response_time_ms?: number },
  ) =>
    apiFetch<{ previous_score: number; new_score: number }>(`/api/quizzes/${quizId}/attempt`, {
      method: "POST",
      body: JSON.stringify({ quiz_id: quizId, ...body }),
    }),
};

// ---------------------------------------------------------------- classrooms (Planner + Peer Learning agents)
export const classroomsApi = {
  planTomorrow: (studentIds: string[]) =>
    apiFetch<{ priority_concepts_tomorrow: unknown[] }>("/api/classrooms/lesson-plan/tomorrow", {
      method: "POST",
      body: JSON.stringify({ student_ids: studentIds }),
    }),
  peerPairs: (conceptId: string, studentIds: string[]) =>
    apiFetch<{ suggested_pairs: unknown[] }>("/api/classrooms/peer-pairs", {
      method: "POST",
      body: JSON.stringify({ concept_id: conceptId, student_ids: studentIds }),
    }),
  digitalTwin: (studentId: string) =>
    apiFetch<{ concept_mastery_history: unknown[]; strengths: string[]; gaps: string[] }>(
      `/api/classrooms/students/${studentId}/digital-twin`,
    ),
};

// ---------------------------------------------------------------- parent communication agent
export const parentApi = {
  generateUpdate: (studentId: string, parentLanguage: string, studentName?: string) =>
    apiFetch<{ text_en: string; text_translated: string; language: string }>("/api/parent/updates/generate", {
      method: "POST",
      body: JSON.stringify({ student_id: studentId, parent_language: parentLanguage, student_name: studentName }),
    }),
};

// ---------------------------------------------------------------- voice agent (STT)
// Separate from apiFetch because this is multipart/form-data — apiFetch
// always forces a JSON content-type header, which would break the upload.
export const voiceApi = {
  transcribe: async (audioBlob: Blob, filename = "question.webm"): Promise<{ transcript: string }> => {
    const token = getToken();
    const form = new FormData();
    form.append("file", audioBlob, filename);

    const res = await fetch(`${API_BASE}/api/voice/transcribe`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.detail ?? res.statusText);
    }
    return res.json();
  },
};