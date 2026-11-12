// Legacy Opportunity and Tracker contracts preserved for existing test suite compatibility
export type OpportunityCategory = 'competition' | 'scholarship';

export type TrackingStatus = 'Saved' | 'Applied' | 'Done';

export interface Opportunity {
  id: number;
  title: string;
  description: string;
  category: OpportunityCategory;
  organizer: string;
  deadline: number; // epoch seconds
  target_majors: string[];
  guideline_text?: string | null;
  guideline_url?: string | null;
  is_published: number; // 0 or 1
  created_at?: number;
  updated_at?: number;
}

export interface TrackedOpportunity {
  id: number;
  user_id: string;
  opportunity_id: number;
  status: TrackingStatus;
  created_at: number;
  updated_at: number;
  applied_at?: number | null;
  completed_at?: number | null;
  opportunity?: Opportunity;
}

export interface PeerProfile {
  id: number;
  user_id: string;
  full_name: string;
  major: string;
  batch_year?: number | null;
  bio?: string | null;
  academic_interests: string[];
  skills: string[];
  contact_info: Record<string, string>;
  is_looking_for_team: number; // 0 or 1
}

export interface StudyPipelineResult {
  document_id: number;
  title: string;
  status: 'ready' | 'processing' | 'failed';
  generated_items?: {
    notes_count: number;
    quizzes_count: number;
    mindmap_nodes: number;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface DeadlineCalculation {
  seconds_remaining: number;
  is_expired: boolean;
  is_urgent: boolean; // < 24 hours remaining
  days: number;
  hours: number;
  minutes: number;
  formatted_countdown: string;
}

export function computeDeadlineState(deadlineEpochSecs: number, nowEpochSecs: number = Math.floor(Date.now() / 1000)): DeadlineCalculation {
  const diff = deadlineEpochSecs - nowEpochSecs;
  if (diff <= 0) {
    return {
      seconds_remaining: 0,
      is_expired: true,
      is_urgent: false,
      days: 0,
      hours: 0,
      minutes: 0,
      formatted_countdown: '0d 0h 0m',
    };
  }

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const is_urgent = diff > 0 && diff < 86400; // less than 24 hours

  return {
    seconds_remaining: diff,
    is_expired: false,
    is_urgent,
    days,
    hours,
    minutes,
    formatted_countdown: `${days}d ${hours}h ${minutes}m`,
  };
}

export function shouldShowReminder(status: TrackingStatus, deadlineState: DeadlineCalculation): boolean {
  if (status === 'Applied' || status === 'Done' || deadlineState.is_expired) {
    return false;
  }
  return status === 'Saved';
}

// ============================================================================
// Stuby Frost UI RPC & API Contracts
// ============================================================================

/** ADR-7 Standard Error Envelope */
export interface Adr7Error {
  code: string;
  message: string;
  retryable: boolean;
}

export interface Adr7ErrorResponse {
  error: Adr7Error;
}

/** Standard Health Check Response: GET /api/v1/health */
export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

/** File Upload Response: POST /api/upload */
export interface UploadResponse {
  id: number;
  title: string;
  filename: string;
  subject_id: number | null;
  status: 'ready' | 'processing' | 'error';
  job_id?: number;
}

// ----------------------------------------------------------------------------
// 1. Dashboard Domain
// ----------------------------------------------------------------------------
export interface StreakInfo {
  count: number;
  last_activity_date: string;
  today_done: boolean;
}

export interface HeatmapPoint {
  date: string;
  minutes: number;
  intensity: number; // 0..4
}

export interface WeeklyPoint {
  day: string;
  minutes: number;
  target_minutes: number;
}

export interface OverallStats {
  total_study_minutes: number;
  total_quizzes_taken: number;
  average_accuracy: number;
  streak_days: number;
}

export interface TopicStat {
  topic: string;
  subject: string;
  accuracy: number;
  weak_question_count: number;
}

export interface DashboardRequest {
  streak_only?: boolean;
}

export interface DashboardResponse {
  streak: StreakInfo;
  heatmap: HeatmapPoint[];
  weekly: WeeklyPoint[];
  overall: OverallStats;
  recent_docs: PublicDocSummary[];
  recent_attempts: AttemptSummary[];
  weak_topics: TopicStat[];
  weak_count: number;
}

// ----------------------------------------------------------------------------
// 2. Subjects Domain
// ----------------------------------------------------------------------------
export interface SubjectRow {
  id: number;
  name: string;
  color: string;
  doc_count?: number;
}

export interface ListSubjectsResponse {
  subjects: SubjectRow[];
}

export interface CreateSubjectRequest {
  name: string;
  color?: string;
}

export interface CreateSubjectResponse {
  subject: SubjectRow;
}

export interface DeleteSubjectRequest {
  id: number;
}

// ----------------------------------------------------------------------------
// 3. Documents & Workspace Domain
// ----------------------------------------------------------------------------
export interface PublicDocSummary {
  id: number;
  title: string;
  filename: string;
  subject_id: number | null;
  subject_name?: string | null;
  status: 'ready' | 'processing' | 'error';
  created_at: string;
  page_count?: number;
  summary?: string | null;
}

export interface PublicDoc extends PublicDocSummary {
  content?: string;
  file_size?: number;
}

export interface SubjectSummary {
  id: number;
  name: string;
  color: string;
}

export interface NoteSummary {
  id: number;
  document_id: number;
  content_md: string;
  updated_at: string;
}

export interface QuizSummary {
  id: number;
  title: string;
  question_count: number;
  difficulty: string;
  created_at: string;
}

export interface JobSummary {
  id: number;
  kind: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
}

export interface ListDocumentsRequest {
  subject_id?: number;
}

export interface ListDocumentsResponse {
  documents: PublicDocSummary[];
}

export interface GetDocumentRequest {
  id: number;
}

export interface GetDocumentResponse {
  document: PublicDoc;
  subject: SubjectSummary | null;
  note: NoteSummary | null;
  quizzes: QuizSummary[];
  job: JobSummary | null;
}

export interface UpdateDocumentRequest {
  id: number;
  title?: string;
  subject_id?: number | null;
}

export interface DeleteDocumentRequest {
  id: number;
}

export interface ReprocessDocumentRequest {
  id: number;
  style?: string;
}

export interface ReprocessDocumentResponse {
  job_id: number;
}

// ----------------------------------------------------------------------------
// 4. Notes Domain
// ----------------------------------------------------------------------------
export interface SaveNoteRequest {
  document_id: number;
  content_md: string;
}

// ----------------------------------------------------------------------------
// 5. Analytics Domain
// ----------------------------------------------------------------------------
export interface LogStudyRequest {
  seconds: number;
  document_id?: number;
}

export interface LogStudyResponse {
  streak: StreakInfo;
}

export interface WeeklyActivity {
  week_start: string;
  total_minutes: number;
  completed_quizzes: number;
}

export interface TrendPoint {
  date: string;
  score: number;
}

export interface TopicMastery {
  topic: string;
  subject: string;
  mastery_percentage: number;
  tier: 'baru' | 'dikenal' | 'paham' | 'kuasai';
}

export interface DocProgress {
  document_id: number;
  title: string;
  studied_minutes: number;
  mastery_rate: number;
}

export interface ProgressResponse {
  overall: OverallStats;
  streak: StreakInfo;
  weekly: WeeklyActivity[];
  trend: TrendPoint[];
  topics: TopicMastery[];
  documents: DocProgress[];
  study_days: number[];
  weak_count: number;
  settings: Record<string, string>;
}

// ----------------------------------------------------------------------------
// 6. Quizzes Domain
// ----------------------------------------------------------------------------
export interface QuizListRow {
  id: number;
  title: string;
  document_id: number;
  document_title?: string;
  question_count: number;
  difficulty: 'easy' | 'medium' | 'hard';
  created_at: string;
  attempts_count?: number;
  last_score?: number | null;
}

export interface ListQuizzesRequest {
  document_id?: number;
  subject_id?: number;
}

export interface ListQuizzesResponse {
  quizzes: QuizListRow[];
}

export interface GenerateQuizRequest {
  document_id?: number;
  subject_id?: number;
  count?: number;
  difficulty?: string;
  qtypes?: string[];
}

export interface GenerateQuizResponse {
  quiz_id: number;
  job_id: number;
}

export interface DeleteQuizRequest {
  id: number;
}

export interface PublicQuestion {
  id: number;
  quiz_id?: number;
  type: 'mcq' | 'tf' | 'short';
  prompt: string;
  options?: string[];
  explanation?: string;
  topic?: string;
}

export interface StartAttemptRequest {
  quiz_id: number;
  mode: 'practice' | 'exam';
  time_limit?: number; // seconds
}

export interface StartAttemptResponse {
  attempt: {
    id: number;
    quiz_id: number;
    mode: string;
    started_at: string;
    time_limit: number | null;
    total: number;
    questions: PublicQuestion[];
  };
}

export interface StartReviewRequest {
  count?: number;
  subject_id?: number;
  document_id?: number;
}

export interface StartReviewResponse {
  attempt: {
    id: number;
    mode: 'review';
    total: number;
    questions: PublicQuestion[];
  };
}

export interface AttemptDetail {
  id: number;
  quiz_id: number;
  mode: string;
  started_at: string;
  completed_at?: string | null;
  time_limit: number | null;
  total: number;
}

export interface QuizDetail {
  id: number;
  title: string;
  difficulty: string;
}

export interface AttemptResult {
  score: number;
  total: number;
  percentage: number;
  passed?: boolean;
}

export interface AttemptSummary {
  attempt_id: number;
  quiz_id: number;
  quiz_title: string;
  score: number;
  total: number;
  percentage: number;
  date: string;
}

export interface GetAttemptRequest {
  id: number;
}

export interface GetAttemptResponse {
  attempt: AttemptDetail;
  quiz: QuizDetail | null;
  questions: PublicQuestion[];
  answers: Record<string, string>;
  result: AttemptResult | null;
}

export interface CheckAnswerRequest {
  attempt_id: number;
  question_id: number;
  answer: string;
}

export interface CheckAnswerResponse {
  correct: boolean;
  explanation: string;
  correct_answer?: string;
}

export interface FinishAttemptRequest {
  attempt_id: number;
  answers?: Record<string, string>;
}

export interface FinishAttemptResponse {
  attempt_id: number;
  score: number;
  total: number;
  percentage: number;
  questions: PublicQuestion[];
  answers: Record<string, string>;
  result: AttemptResult;
}

export interface ExplainQuestionRequest {
  question_id: number;
  given_answer?: string;
}

export interface ExplainQuestionResponse {
  explanation: string;
}

// ----------------------------------------------------------------------------
// 7. Flashcards Domain
// ----------------------------------------------------------------------------
export interface FlashcardItem {
  id: number;
  document_id: number;
  front: string;
  back: string;
  next_review: string;
  interval: number;
  ease_factor: number;
  repetitions: number;
}

export interface CardsDueRequest {
  subject_id?: number;
  document_id?: number;
  limit?: number;
}

export interface CardsDueResponse {
  cards: FlashcardItem[];
  count: number;
}

export interface CardsReviewRequest {
  card_id: number;
  rating: 1 | 3 | 4 | 5;
}

export interface CardsReviewResponse {
  card_id: number;
  next_review: string;
  interval: number;
  ease_factor: number;
}

export interface CardsBuildRequest {
  document_id?: number;
  subject_id?: number;
}

export interface CardsBuildResponse {
  created: number;
  updated: number;
}

export interface CardsStatsResponse {
  total: number;
  due_today: number;
  learned: number;
  retention_rate: number;
}

export interface CardsExportRequest {
  subject_id?: number;
  document_id?: number;
}

export interface CardsExportResponse {
  tsv: string;
  filename: string;
}

// ----------------------------------------------------------------------------
// 8. Games & Mastery Domain
// ----------------------------------------------------------------------------
export interface GameMode {
  id: string;
  title: string;
  description: string;
  icon: string;
  badge?: string;
}

export interface WeakConcept {
  id: number;
  concept: string;
  mistake_count: number;
}

export interface GameRunSummary {
  run_id: string;
  mode_id: string;
  mode_title: string;
  turn: number;
  turns_total: number;
  score: number;
}

export interface PlayerLevel {
  level: number;
  current_xp: number;
  next_level_xp: number;
  title: string;
}

export interface DailyQuest {
  id: string;
  title: string;
  completed: boolean;
  reward_xp: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  icon: string;
}

export interface PlayHubResponse {
  modes: GameMode[];
  counts: Record<string, number>;
  weak: WeakConcept[];
  due_count: number;
  active_run: GameRunSummary | null;
  level: PlayerLevel;
  quests: DailyQuest[];
  achievements: Achievement[];
}

export interface ConceptMasteryItem {
  id: number;
  name: string;
  subject_id: number;
  tier: 'baru' | 'dikenal' | 'paham' | 'kuasai';
  accuracy: number;
  last_practiced?: string;
}

export interface MasteryGrid {
  total: number;
  tiers: {
    baru: number;
    dikenal: number;
    paham: number;
    kuasai: number;
  };
}

export interface PlayMapRequest {
  subject_id?: number;
  document_id?: number;
}

export interface PlayMapResponse {
  concepts: ConceptMasteryItem[];
  grid: MasteryGrid;
}

export interface PlayTurnRequest {
  run_id: string;
  action: string;
  answer?: string;
}

export interface PlayTurnResponse {
  text: string;
  turn: number;
  score: number;
  done: boolean;
  feedback?: string;
}

export interface TurnRecord {
  turn: number;
  question: string;
  answer?: string;
  feedback?: string;
  score: number;
}

export interface PlayGetRequest {
  run_id: string;
}

export interface PlayGetResponse {
  run: {
    id: string;
    game: string;
    status: string;
    score: number;
    turn: number;
    turns_total: number;
    history: TurnRecord[];
  };
}

export interface PlayFinishRequest {
  run_id: string;
}

export interface PlayFinishResponse {
  run_id: string;
  score: number;
  xp_earned: number;
  report: string;
}

export interface PlayAbandonRequest {
  run_id: string;
}

export interface PlayFlagRequest {
  run_id: string;
  turn_idx: number;
  reason: string;
}

// ----------------------------------------------------------------------------
// 9. Settings, Diagnostics & Jobs Domain
// ----------------------------------------------------------------------------
export interface GetSettingsResponse {
  settings: Record<string, string>;
  timezone: string;
}

export interface SaveSettingsRequest {
  settings: Record<string, any>;
}

export interface SaveSettingsResponse {
  settings: Record<string, string>;
}

export interface LlmCheckResponse {
  ok: boolean;
  provider: string;
  model: string;
  latency_ms: number;
}

export interface GetJobRequest {
  id: number;
}

export interface JobDetailResponse {
  id: number;
  kind: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  error: string | null;
}

export interface PingResponse {
  version: string;
  time: number;
  llm_configured: boolean;
}

// ----------------------------------------------------------------------------
// RPC Action Map (All 38 Stuby Actions)
// ----------------------------------------------------------------------------
export interface StubyRpcActionMap {
  dashboard: { request: DashboardRequest; response: DashboardResponse };
  list_subjects: { request: Record<string, never>; response: ListSubjectsResponse };
  create_subject: { request: CreateSubjectRequest; response: CreateSubjectResponse };
  delete_subject: { request: DeleteSubjectRequest; response: Record<string, never> };
  list_documents: { request: ListDocumentsRequest; response: ListDocumentsResponse };
  get_document: { request: GetDocumentRequest; response: GetDocumentResponse };
  update_document: { request: UpdateDocumentRequest; response: Record<string, never> };
  delete_document: { request: DeleteDocumentRequest; response: Record<string, never> };
  reprocess_document: { request: ReprocessDocumentRequest; response: ReprocessDocumentResponse };
  save_note: { request: SaveNoteRequest; response: Record<string, never> };
  log_study: { request: LogStudyRequest; response: LogStudyResponse };
  list_quizzes: { request: ListQuizzesRequest; response: ListQuizzesResponse };
  generate_quiz: { request: GenerateQuizRequest; response: GenerateQuizResponse };
  delete_quiz: { request: DeleteQuizRequest; response: Record<string, never> };
  start_attempt: { request: StartAttemptRequest; response: StartAttemptResponse };
  start_review: { request: StartReviewRequest; response: StartReviewResponse };
  get_attempt: { request: GetAttemptRequest; response: GetAttemptResponse };
  check_answer: { request: CheckAnswerRequest; response: CheckAnswerResponse };
  finish_attempt: { request: FinishAttemptRequest; response: FinishAttemptResponse };
  explain_question: { request: ExplainQuestionRequest; response: ExplainQuestionResponse };
  cards_due: { request: CardsDueRequest; response: CardsDueResponse };
  cards_review: { request: CardsReviewRequest; response: CardsReviewResponse };
  cards_build: { request: CardsBuildRequest; response: CardsBuildResponse };
  cards_stats: { request: Record<string, never>; response: CardsStatsResponse };
  cards_export: { request: CardsExportRequest; response: CardsExportResponse };
  play_hub: { request: Record<string, never>; response: PlayHubResponse };
  play_map: { request: PlayMapRequest; response: PlayMapResponse };
  play_turn: { request: PlayTurnRequest; response: PlayTurnResponse };
  play_get: { request: PlayGetRequest; response: PlayGetResponse };
  play_finish: { request: PlayFinishRequest; response: PlayFinishResponse };
  play_abandon: { request: PlayAbandonRequest; response: { ok: boolean } };
  play_flag: { request: PlayFlagRequest; response: { ok: boolean } };
  progress: { request: Record<string, never>; response: ProgressResponse };
  get_settings: { request: Record<string, never>; response: GetSettingsResponse };
  save_settings: { request: SaveSettingsRequest; response: SaveSettingsResponse };
  llm_check: { request: Record<string, never>; response: LlmCheckResponse };
  get_job: { request: GetJobRequest; response: JobDetailResponse };
  ping: { request: Record<string, never>; response: PingResponse };
}

export type StubyRpcActionName = keyof StubyRpcActionMap;
