import { apiFetch } from '../../services/api/client';
import type { Opportunity, TrackedOpportunity } from './types';

export interface OpportunityQuery {
  category?: string;
  search?: string;
  major?: string;
  limit?: number;
  offset?: number;
}

export async function fetchOpportunities(q: OpportunityQuery, signal?: AbortSignal): Promise<Opportunity[]> {
  const params = new URLSearchParams();
  if (q.category) params.set('category', q.category);
  if (q.search?.trim()) params.set('search', q.search.trim());
  if (q.major?.trim()) params.set('major', q.major.trim());
  params.set('limit', String(q.limit ?? 60));
  if (q.offset) params.set('offset', String(q.offset));
  const res = await apiFetch<{ opportunities: Opportunity[] }>(`/opportunities?${params.toString()}`, { signal });
  return res.opportunities ?? [];
}

export async function fetchTracked(signal?: AbortSignal): Promise<TrackedOpportunity[]> {
  const res = await apiFetch<{ tracked: TrackedOpportunity[] }>('/tracked-opportunities', { signal });
  return res.tracked ?? [];
}

export async function trackOpportunity(opportunityId: number): Promise<TrackedOpportunity> {
  const res = await apiFetch<{ tracked: TrackedOpportunity }>('/tracked-opportunities', {
    method: 'POST',
    body: { opportunity_id: opportunityId },
  });
  return res.tracked;
}

export async function untrack(trackedId: number): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/tracked-opportunities/${trackedId}`, { method: 'DELETE' });
}
