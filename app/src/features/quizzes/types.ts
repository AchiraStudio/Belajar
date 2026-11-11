export type QuestionType = 'mcq' | 'tf' | 'short';
export type AttemptMode = 'practice' | 'exam' | 'review';

export interface QuizSummary {
  id: number;
  title: string;
  difficulty?: string | null;
  created_at?: number | null;
  document_id?: number | null;
  source_title?: string | null;
  question_count: number;
  attempt_count: number;
  last_pct?: number | null;
}

export interface AttemptQuestion {
  id: number;
  qtype: QuestionType;
  question: string;
  options?: string[] | null;
  topic?: string | null;
  source?: string | null;
  position?: number | null;
  given?: string | null;
  revealed?: boolean;
  /** Only present once revealed (practice) or finished. */
  answer?: string | null;
  answer_text?: string | null;
  explanation?: string | null;
  deep_explanation?: string | null;
  correct?: boolean | null;
  feedback?: string | null;
  given_text?: string | null;
}

export interface Attempt {
  id: number;
  quiz_id?: number | null;
  mode: AttemptMode;
  time_limit?: number | null;
  started_at?: number | null;
  finished_at?: number | null;
  score?: number | null;
  total?: number | null;
  duration?: number | null;
  grading?: 'pending' | 'done' | null;
  grading_job?: number | null;
  title: string;
}

export interface AttemptResponse {
  attempt: Attempt;
  questions: AttemptQuestion[];
}
