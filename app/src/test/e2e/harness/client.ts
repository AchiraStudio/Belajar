import type {
  Opportunity,
  PeerProfile,
  StudyPipelineResult,
  TrackedOpportunity,
} from './contracts';
import { ContractSimulator, type UserSession } from './simulator';

export interface E2EClientOptions {
  session?: UserSession;
  baseUrl?: string;
  simulator?: ContractSimulator;
}

export interface ApiResponse<T> {
  status: number;
  data: T;
}

export class E2EClient {
  private session: UserSession;
  private baseUrl: string;
  private simulator?: ContractSimulator;

  constructor(options: E2EClientOptions = {}) {
    this.session = options.session || { userId: 'student-default-uuid', role: 'student' };
    const envBase = typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.E2E_BASE_URL;
    this.baseUrl = options.baseUrl || envBase || '';
    this.simulator = options.simulator;
  }

  public setSession(session: UserSession): void {
    this.session = session;
  }

  public getSession(): UserSession {
    return this.session;
  }

  // --- Generic HTTP Dispatcher ---

  private async dispatch<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
  ): Promise<ApiResponse<T>> {
    const isLive = Boolean(this.baseUrl && this.baseUrl.trim() !== '');

    if (isLive) {
      const url = new URL(`${this.baseUrl}/api/v1${endpoint}`);
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined) {
            url.searchParams.set(k, v);
          }
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.session.userId}`,
        'X-User-Role': this.session.role,
      };

      const res = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const responseData = (await res.json().catch(() => ({}))) as T;
      return { status: res.status, data: responseData };
    }

    // In Contract / Simulator Mode:
    if (!this.simulator) {
      throw new Error('Simulator instance not configured for E2EClient');
    }

    return this.dispatchToSimulator<T>(method, endpoint, body, query);
  }

  private dispatchToSimulator<T>(
    method: string,
    endpoint: string,
    body?: any,
    query?: Record<string, string | undefined>,
  ): ApiResponse<T> {
    const sim = this.simulator!;

    // Opportunities:
    if (endpoint === '/opportunities' && method === 'POST') {
      const res = sim.createOpportunity(this.session, body);
      return { status: res.status, data: res.body as T };
    }

    if (endpoint === '/opportunities' && method === 'GET') {
      const res = sim.listOpportunities(this.session, query);
      return { status: res.status, data: res.body as T };
    }

    const oppIdMatch = endpoint.match(/^\/opportunities\/(\d+)$/);
    if (oppIdMatch && oppIdMatch[1]) {
      const id = parseInt(oppIdMatch[1], 10);
      if (method === 'GET') {
        const res = sim.getOpportunity(id);
        return { status: res.status, data: res.body as T };
      }
      if (method === 'PUT') {
        const res = sim.updateOpportunity(this.session, id, body);
        return { status: res.status, data: res.body as T };
      }
      if (method === 'DELETE') {
        const res = sim.deleteOpportunity(this.session, id);
        return { status: res.status, data: res.body as T };
      }
    }

    // Tracked Opportunities:
    if (endpoint === '/tracked-opportunities' && method === 'POST') {
      const res = sim.trackOpportunity(this.session, body.opportunity_id);
      return { status: res.status, data: res.body as T };
    }

    if (endpoint === '/tracked-opportunities' && method === 'GET') {
      const res = sim.listTracked(this.session, query?.status);
      return { status: res.status, data: res.body as T };
    }

    const trackIdMatch = endpoint.match(/^\/tracked-opportunities\/(\d+)$/);
    if (trackIdMatch && trackIdMatch[1]) {
      const id = parseInt(trackIdMatch[1], 10);
      if (method === 'PATCH') {
        const res = sim.updateTrackedStatus(this.session, id, body.status);
        return { status: res.status, data: res.body as T };
      }
      if (method === 'DELETE') {
        const res = sim.deleteTracked(this.session, id);
        return { status: res.status, data: res.body as T };
      }
    }

    // Peer Profiles:
    if (endpoint === '/profiles/me' && method === 'GET') {
      const res = sim.getMyProfile(this.session);
      return { status: res.status, data: res.body as T };
    }

    if (endpoint === '/profiles/me' && method === 'PUT') {
      const res = sim.updateMyProfile(this.session, body);
      return { status: res.status, data: res.body as T };
    }

    if (endpoint === '/profiles' && method === 'GET') {
      const res = sim.listProfiles(query);
      return { status: res.status, data: res.body as T };
    }

    const profileIdMatch = endpoint.match(/^\/profiles\/(\d+)$/);
    if (profileIdMatch && profileIdMatch[1] && method === 'GET') {
      const id = parseInt(profileIdMatch[1], 10);
      const res = sim.getProfileById(id);
      return { status: res.status, data: res.body as T };
    }

    // Study Pipeline:
    const studyMatch = endpoint.match(/^\/opportunities\/(\d+)\/study$/);
    if (studyMatch && studyMatch[1] && method === 'POST') {
      const id = parseInt(studyMatch[1], 10);
      const res = sim.initiateOpportunityStudy(id);
      return { status: res.status, data: res.body as T };
    }

    const docMatch = endpoint.match(/^\/study\/documents\/(\d+)$/);
    if (docMatch && docMatch[1] && method === 'GET') {
      const id = parseInt(docMatch[1], 10);
      const res = sim.getStudyDocument(id);
      return { status: res.status, data: res.body as T };
    }

    return {
      status: 404,
      data: { error: { code: 'not_found', message: `Endpoint ${endpoint} not found`, retryable: false } } as T,
    };
  }

  // --- Domain Methods ---

  public async createOpportunity(data: Partial<Opportunity>): Promise<ApiResponse<{ opportunity?: Opportunity; error?: any }>> {
    return this.dispatch('POST', '/opportunities', data);
  }

  public async getOpportunity(id: number): Promise<ApiResponse<{ opportunity?: Opportunity; error?: any }>> {
    return this.dispatch('GET', `/opportunities/${id}`);
  }

  public async updateOpportunity(id: number, data: Partial<Opportunity>): Promise<ApiResponse<{ opportunity?: Opportunity; error?: any }>> {
    return this.dispatch('PUT', `/opportunities/${id}`, data);
  }

  public async deleteOpportunity(id: number): Promise<ApiResponse<{ ok?: boolean; error?: any }>> {
    return this.dispatch('DELETE', `/opportunities/${id}`);
  }

  public async listOpportunities(query?: {
    category?: string;
    major?: string;
    search?: string;
    status?: string;
  }): Promise<ApiResponse<{ opportunities?: Opportunity[]; error?: any }>> {
    return this.dispatch('GET', '/opportunities', undefined, query);
  }

  public async trackOpportunity(opportunityId: number): Promise<ApiResponse<{ tracked?: TrackedOpportunity; error?: any }>> {
    return this.dispatch('POST', '/tracked-opportunities', { opportunity_id: opportunityId });
  }

  public async listTracked(statusFilter?: string): Promise<ApiResponse<{ tracked?: TrackedOpportunity[]; error?: any }>> {
    return this.dispatch('GET', '/tracked-opportunities', undefined, statusFilter ? { status: statusFilter } : undefined);
  }

  public async updateTrackedStatus(id: number, status: string): Promise<ApiResponse<{ tracked?: TrackedOpportunity; error?: any }>> {
    return this.dispatch('PATCH', `/tracked-opportunities/${id}`, { status });
  }

  public async deleteTracked(id: number): Promise<ApiResponse<{ ok?: boolean; error?: any }>> {
    return this.dispatch('DELETE', `/tracked-opportunities/${id}`);
  }

  public async getMyProfile(): Promise<ApiResponse<{ profile?: PeerProfile; error?: any }>> {
    return this.dispatch('GET', '/profiles/me');
  }

  public async updateMyProfile(data: Partial<PeerProfile>): Promise<ApiResponse<{ profile?: PeerProfile; error?: any }>> {
    return this.dispatch('PUT', '/profiles/me', data);
  }

  public async getProfileById(id: number): Promise<ApiResponse<{ profile?: PeerProfile; error?: any }>> {
    return this.dispatch('GET', `/profiles/${id}`);
  }

  public async listProfiles(query?: {
    major?: string;
    skill?: string;
    search?: string;
    looking_for_team?: string;
  }): Promise<ApiResponse<{ profiles?: PeerProfile[]; error?: any }>> {
    return this.dispatch('GET', '/profiles', undefined, query);
  }

  public async initiateOpportunityStudy(opportunityId: number): Promise<ApiResponse<StudyPipelineResult & { error?: any }>> {
    return this.dispatch('POST', `/opportunities/${opportunityId}/study`);
  }

  public async getStudyDocument(docId: number): Promise<ApiResponse<{ document?: any; error?: any }>> {
    return this.dispatch('GET', `/study/documents/${docId}`);
  }
}
