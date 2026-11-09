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
  // Reminders must be strictly suppressed if status is Applied or Done, or if deadline is expired
  if (status === 'Applied' || status === 'Done' || deadlineState.is_expired) {
    return false;
  }
  return status === 'Saved';
}
