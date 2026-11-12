export type OpportunityCategory = 'scholarship' | 'competition';

/** Mirrors `stuby_storage::Opportunity` (GET /api/v1/opportunities). Dates are Unix seconds. */
export interface Opportunity {
  id: number;
  title: string;
  description: string;
  category: OpportunityCategory | string;
  organizer: string;
  deadline: number;
  reward?: string | null;
  target_majors: string[];
  eligibility?: string | null;
  website_url?: string | null;
  guideline_url?: string | null;
  guideline_text?: string | null;
  is_published: number;
  created_at: number;
  updated_at: number;
}

export type TrackStatus = 'Saved' | 'Applied' | 'Done';

/** Mirrors `TrackedOpportunityDto` (GET /api/v1/tracked-opportunities). */
export interface TrackedOpportunity {
  id: number;
  opportunity_id: number;
  status: TrackStatus | string;
  notes?: string | null;
  countdown_seconds: number;
  is_overdue: boolean;
  remind: boolean;
  opportunity: Pick<Opportunity, 'id' | 'title' | 'category' | 'organizer' | 'deadline' | 'reward' | 'website_url'> | null;
}

export type DeadlineKind = 'open' | 'soon' | 'closed';

export interface DeadlineState {
  kind: DeadlineKind;
  label: string;
  days: number;
}
