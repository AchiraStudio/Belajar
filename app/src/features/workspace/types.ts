export interface DocumentSubject {
  id: number;
  name: string;
  color?: string;
}

export interface DocumentNote {
  id?: number;
  document_id?: number;
  content_md: string;
  edited?: number; // 0 = original, 1 = edited
  updated_at?: string;
}

export interface DocumentQuizSummary {
  id: number;
  title: string;
  question_count: number;
  best_pct?: number | null;
  difficulty?: string;
  created_at?: string;
}

export interface DocumentJob {
  id?: number;
  progress?: number;
  message?: string;
  status?: string;
}

export interface WorkspaceDocument {
  id: number;
  title: string;
  filename?: string;
  size?: number;
  file_size?: number;
  status: 'queued' | 'processing' | 'ready' | 'error';
  page_count?: number;
  style?: string;
  error?: string;
  warning?: string;
  summary?: string | null;
  key_concepts?: string[];
  topics?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface DocumentDetailResponse {
  document: WorkspaceDocument;
  subject?: DocumentSubject | null;
  note?: DocumentNote | null;
  quizzes?: DocumentQuizSummary[];
  job?: DocumentJob | null;
}

export interface StreakInfo {
  count?: number;
  current_streak?: number;
  last_activity_date?: string;
  today_done?: boolean;
  seconds_today?: number;
  freezes_available?: number;
}

export interface LogStudyResponse {
  streak?: StreakInfo;
}

export interface TocItem {
  id: string;
  text: string;
  level?: number;
}

export type WorkspaceTabId = 'catatan' | 'mindmap' | 'chat' | 'kuis';

export type NoteStyle = 'ringkas' | 'cornell' | 'detail' | 'sederhana';
