export interface ProgressOverall {
  attempts: number;
  answers: number;
  /** `null` when there are no answers yet: "no data" must not render as 0%. */
  accuracy: number | null;
  study_seconds: number;
  documents: number;
  quizzes: number;
  questions: number;
}

export interface ProgressStreak {
  current: number;
  longest: number;
  freezes: number;
  at_risk: boolean;
  today: { day: string; seconds: number; quizzes: number; goal_seconds: number; done: boolean };
}

export interface TrendPoint {
  id: number;
  ts: number;
  score: number;
  total: number;
  mode: string;
  title: string;
}

export interface TopicStat {
  topic: string | null;
  n: number;
  ok: number;
  acc: number;
  level: 'weak' | 'strong' | '' | string;
}

export interface DocumentStat {
  id: number;
  title: string;
  n: number;
  acc: number | null;
}

export interface StudyDay {
  day: string;
  seconds: number;
  quizzes: number;
}

export interface ProgressResponse {
  overall: ProgressOverall;
  streak: ProgressStreak;
  weekly: { start: string; seconds: number; quizzes: number; goal_min: number };
  trend: TrendPoint[];
  topics: TopicStat[];
  documents: DocumentStat[];
  study_days: StudyDay[];
  weak_count: number;
  settings: Record<string, string>;
}

export interface Achievement {
  key: string;
  title: string;
  desc: string;
  unlocked: boolean;
  at: number | null;
}

export interface HubProfile {
  level: number;
  xp: number;
  level_start: number;
  next: number;
}

export interface HubSummary {
  profile?: HubProfile;
  achievements?: Achievement[];
  levels?: { baru: number; dikenal: number; paham: number; kuasai: number };
}
