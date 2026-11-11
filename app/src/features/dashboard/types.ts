export interface StreakToday {
  day?: string;
  seconds?: number;
  goal_seconds?: number;
  quizzes?: number;
  done?: boolean;
}

export interface StreakInfo {
  count?: number;
  current?: number;
  current_streak?: number;
  longest?: number;
  freezes?: number;
  freezes_available?: number;
  at_risk?: boolean;
  last_activity_date?: string;
  today_done?: boolean;
  today?: StreakToday;
}

export interface HeatmapPoint {
  day?: string;
  date?: string;
  seconds?: number;
  minutes?: number;
  quizzes?: number;
  level?: number;      // 0..4
  intensity?: number;  // 0..4
}

export interface WeeklyData {
  start?: string;
  seconds?: number;
  minutes?: number;
  goal_min?: number;
  target_minutes?: number;
  quizzes?: number;
  day?: string;
}

export interface OverallStats {
  attempts?: number;
  total_quizzes_taken?: number;
  answers?: number;
  accuracy?: number;
  average_accuracy?: number;
  study_seconds?: number;
  total_study_minutes?: number;
  documents?: number;
  streak_days?: number;
}

export interface RecentDoc {
  id: number;
  title: string;
  filename?: string;
  status: 'ready' | 'processing' | 'error' | 'queued';
  page_count?: number;
  updated_at?: string;
  created_at?: string;
  subject_name?: string | null;
  subject_color?: string | null;
}

export interface RecentAttempt {
  id?: number;
  attempt_id?: number;
  quiz_id?: number;
  quiz_title?: string;
  title?: string;
  score: number;
  total: number;
  mode?: string;
  pct?: number;
  percentage?: number;
  ts?: number;
  date?: string;
}

export interface WeakTopic {
  topic: string;
  subject?: string;
  n?: number;
  ok?: number;
  acc?: number;
  accuracy?: number;
  weak_question_count?: number;
  level?: string;
}

export interface DashboardResponse {
  streak: StreakInfo;
  heatmap: HeatmapPoint[];
  weekly: WeeklyData[] | WeeklyData;
  overall: OverallStats;
  recent_docs: RecentDoc[];
  recent_attempts: RecentAttempt[];
  weak_topics: WeakTopic[];
  weak_count: number;
}
