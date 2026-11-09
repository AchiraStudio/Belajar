import type {
  Opportunity,
  OpportunityCategory,
  PeerProfile,
  StudyPipelineResult,
  TrackedOpportunity,
  TrackingStatus,
} from './contracts';

export interface UserSession {
  userId: string;
  role: 'admin' | 'student';
}

export class ContractSimulator {
  private opportunities: Map<number, Opportunity> = new Map();
  private tracked: Map<number, TrackedOpportunity> = new Map();
  private profiles: Map<string, PeerProfile> = new Map();
  private documents: Map<number, { id: number; title: string; content: string; status: string }> = new Map();

  private nextOpportunityId = 1;
  private nextTrackedId = 1;
  private nextProfileId = 1;
  private nextDocumentId = 1;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.opportunities.clear();
    this.tracked.clear();
    this.profiles.clear();
    this.documents.clear();
    this.nextOpportunityId = 1;
    this.nextTrackedId = 1;
    this.nextProfileId = 1;
    this.nextDocumentId = 1;
  }

  public getNowSecs(): number {
    return Math.floor(Date.now() / 1000);
  }

  // --- Opportunities (R1) ---

  public createOpportunity(session: UserSession, data: Partial<Opportunity>): { status: number; body: unknown } {
    if (session.role !== 'admin') {
      return {
        status: 403,
        body: { error: { code: 'forbidden', message: 'Hanya administrator yang dapat membuat peluang.', retryable: false } },
      };
    }

    if (!data.title || !data.category || data.deadline === undefined) {
      return {
        status: 400,
        body: { error: { code: 'bad_request', message: 'Judul, kategori, dan tenggat waktu wajib diisi.', retryable: false } },
      };
    }

    const id = this.nextOpportunityId++;
    const now = this.getNowSecs();
    const opportunity: Opportunity = {
      id,
      title: data.title.trim(),
      description: data.description?.trim() || '',
      category: data.category as OpportunityCategory,
      organizer: data.organizer?.trim() || 'Universitas',
      deadline: data.deadline,
      target_majors: Array.isArray(data.target_majors) ? data.target_majors.map((m) => m.trim()).filter(Boolean) : [],
      guideline_text: data.guideline_text || null,
      guideline_url: data.guideline_url || null,
      is_published: data.is_published !== undefined ? data.is_published : 1,
      created_at: now,
      updated_at: now,
    };

    this.opportunities.set(id, opportunity);
    return { status: 201, body: { opportunity } };
  }

  public getOpportunity(id: number): { status: number; body: unknown } {
    const opp = this.opportunities.get(id);
    if (!opp) {
      return {
        status: 404,
        body: { error: { code: 'not_found', message: 'Peluang tidak ditemukan.', retryable: false } },
      };
    }
    return { status: 200, body: { opportunity: opp } };
  }

  public updateOpportunity(session: UserSession, id: number, updates: Partial<Opportunity>): { status: number; body: unknown } {
    if (session.role !== 'admin') {
      return {
        status: 403,
        body: { error: { code: 'forbidden', message: 'Hanya administrator yang dapat mengubah peluang.', retryable: false } },
      };
    }

    const opp = this.opportunities.get(id);
    if (!opp) {
      return {
        status: 404,
        body: { error: { code: 'not_found', message: 'Peluang tidak ditemukan.', retryable: false } },
      };
    }

    const updated: Opportunity = {
      ...opp,
      ...updates,
      id: opp.id,
      updated_at: this.getNowSecs(),
    };

    if (updates.target_majors) {
      updated.target_majors = updates.target_majors.map((m) => m.trim()).filter(Boolean);
    }

    this.opportunities.set(id, updated);
    return { status: 200, body: { opportunity: updated } };
  }

  public deleteOpportunity(session: UserSession, id: number): { status: number; body: unknown } {
    if (session.role !== 'admin') {
      return {
        status: 403,
        body: { error: { code: 'forbidden', message: 'Hanya administrator yang dapat menghapus peluang.', retryable: false } },
      };
    }

    if (!this.opportunities.has(id)) {
      return {
        status: 404,
        body: { error: { code: 'not_found', message: 'Peluang tidak ditemukan.', retryable: false } },
      };
    }

    this.opportunities.delete(id);
    // cascade delete or clean tracked items
    for (const [tid, item] of this.tracked.entries()) {
      if (item.opportunity_id === id) {
        this.tracked.delete(tid);
      }
    }

    return { status: 200, body: { ok: true } };
  }

  public listOpportunities(
    session: UserSession,
    query: { category?: string; major?: string; search?: string; status?: string } = {},
  ): { status: number; body: unknown } {
    const now = this.getNowSecs();
    let results = Array.from(this.opportunities.values());

    // Non-admin can only see published opportunities
    if (session.role !== 'admin') {
      results = results.filter((o) => o.is_published === 1);
    }

    if (query.category) {
      const cat = query.category.toLowerCase().trim();
      results = results.filter((o) => o.category.toLowerCase() === cat);
    }

    if (query.major) {
      const targetMajor = query.major.toLowerCase().trim();
      results = results.filter(
        (o) =>
          o.target_majors.length === 0 || // open to all majors
          o.target_majors.some((m) => m.toLowerCase().includes(targetMajor) || targetMajor.includes(m.toLowerCase())),
      );
    }

    if (query.search) {
      const q = query.search.toLowerCase().trim();
      results = results.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.description.toLowerCase().includes(q) ||
          o.organizer.toLowerCase().includes(q),
      );
    }

    if (query.status) {
      if (query.status === 'open') {
        results = results.filter((o) => o.deadline > now);
      } else if (query.status === 'closed') {
        results = results.filter((o) => o.deadline <= now);
      }
    }

    // Sort by deadline ascending
    results.sort((a, b) => a.deadline - b.deadline);

    return { status: 200, body: { opportunities: results } };
  }

  // --- Tracking Lifecycle (R2) ---

  public trackOpportunity(session: UserSession, opportunityId: number): { status: number; body: unknown } {
    const opp = this.opportunities.get(opportunityId);
    if (!opp) {
      return {
        status: 404,
        body: { error: { code: 'not_found', message: 'Peluang yang ingin dilacak tidak ditemukan.', retryable: false } },
      };
    }

    // Check duplicate
    for (const item of this.tracked.values()) {
      if (item.user_id === session.userId && item.opportunity_id === opportunityId) {
        return {
          status: 409,
          body: { error: { code: 'already_tracked', message: 'Peluang ini sudah disimpan di pelacak.', retryable: false } },
        };
      }
    }

    const id = this.nextTrackedId++;
    const now = this.getNowSecs();
    const item: TrackedOpportunity = {
      id,
      user_id: session.userId,
      opportunity_id: opportunityId,
      status: 'Saved',
      created_at: now,
      updated_at: now,
      applied_at: null,
      completed_at: null,
      opportunity: opp,
    };

    this.tracked.set(id, item);
    return { status: 201, body: { tracked: item } };
  }

  public listTracked(session: UserSession, statusFilter?: string): { status: number; body: unknown } {
    let items = Array.from(this.tracked.values()).filter((t) => t.user_id === session.userId);

    if (statusFilter) {
      items = items.filter((t) => t.status.toLowerCase() === statusFilter.toLowerCase());
    }

    // Hydrate opportunity details
    items = items.map((item) => ({
      ...item,
      opportunity: this.opportunities.get(item.opportunity_id) || item.opportunity,
    }));

    return { status: 200, body: { tracked: items } };
  }

  public updateTrackedStatus(session: UserSession, id: number, newStatus: string): { status: number; body: unknown } {
    const item = this.tracked.get(id);
    if (!item) {
      return {
        status: 404,
        body: { error: { code: 'not_found', message: 'Item pelacak tidak ditemukan.', retryable: false } },
      };
    }

    if (item.user_id !== session.userId) {
      return {
        status: 403,
        body: { error: { code: 'forbidden', message: 'Tidak dapat mengubah pelacak milik pengguna lain.', retryable: false } },
      };
    }

    const validStatuses: TrackingStatus[] = ['Saved', 'Applied', 'Done'];
    if (!validStatuses.includes(newStatus as TrackingStatus)) {
      return {
        status: 400,
        body: { error: { code: 'invalid_status', message: `Status tidak valid: ${newStatus}`, retryable: false } },
      };
    }

    // Disallow backward transition from Done to Saved
    if (item.status === 'Done' && newStatus === 'Saved') {
      return {
        status: 400,
        body: { error: { code: 'invalid_transition', message: 'Item yang sudah Done tidak dapat dikembalikan ke Saved.', retryable: false } },
      };
    }

    const now = this.getNowSecs();
    const updated: TrackedOpportunity = {
      ...item,
      status: newStatus as TrackingStatus,
      updated_at: now,
      applied_at: newStatus === 'Applied' && !item.applied_at ? now : item.applied_at,
      completed_at: newStatus === 'Done' && !item.completed_at ? now : item.completed_at,
      opportunity: this.opportunities.get(item.opportunity_id) || item.opportunity,
    };

    this.tracked.set(id, updated);
    return { status: 200, body: { tracked: updated } };
  }

  public deleteTracked(session: UserSession, id: number): { status: number; body: unknown } {
    const item = this.tracked.get(id);
    if (!item) {
      return {
        status: 404,
        body: { error: { code: 'not_found', message: 'Item pelacak tidak ditemukan.', retryable: false } },
      };
    }

    if (item.user_id !== session.userId) {
      return {
        status: 403,
        body: { error: { code: 'forbidden', message: 'Tidak dapat menghapus pelacak pengguna lain.', retryable: false } },
      };
    }

    this.tracked.delete(id);
    return { status: 200, body: { ok: true } };
  }

  // --- Peer Profiles & Matching (R3) ---

  public getMyProfile(session: UserSession): { status: number; body: unknown } {
    let profile = this.profiles.get(session.userId);
    if (!profile) {
      // create default initial profile
      profile = {
        id: this.nextProfileId++,
        user_id: session.userId,
        full_name: 'Mahasiswa Belajar',
        major: 'Informatika',
        batch_year: 2024,
        bio: '',
        academic_interests: [],
        skills: [],
        contact_info: {},
        is_looking_for_team: 1,
      };
      this.profiles.set(session.userId, profile);
    }

    return { status: 200, body: { profile } };
  }

  public updateMyProfile(session: UserSession, data: Partial<PeerProfile>): { status: number; body: unknown } {
    let profile = this.profiles.get(session.userId);

    // Validation
    if (data.skills && data.skills.length > 20) {
      return {
        status: 400,
        body: { error: { code: 'skill_limit_exceeded', message: 'Maksimal 20 keahlian diperbolehkan.', retryable: false } },
      };
    }

    if (data.bio && data.bio.length > 2000) {
      return {
        status: 400,
        body: { error: { code: 'bio_too_long', message: 'Bio maksimal 2000 karakter.', retryable: false } },
      };
    }

    if (data.batch_year !== undefined && data.batch_year !== null) {
      if (data.batch_year < 1950 || data.batch_year > 2100) {
        return {
          status: 400,
          body: { error: { code: 'invalid_batch_year', message: 'Tahun angkatan harus antara 1950 dan 2100.', retryable: false } },
        };
      }
    }

    if (!profile) {
      profile = {
        id: this.nextProfileId++,
        user_id: session.userId,
        full_name: data.full_name || 'Mahasiswa Belajar',
        major: data.major || 'Informatika',
        batch_year: data.batch_year ?? 2024,
        bio: data.bio || '',
        academic_interests: data.academic_interests || [],
        skills: data.skills || [],
        contact_info: data.contact_info || {},
        is_looking_for_team: data.is_looking_for_team ?? 1,
      };
    } else {
      profile = {
        ...profile,
        ...data,
        id: profile.id,
        user_id: session.userId,
      };
    }

    this.profiles.set(session.userId, profile);
    return { status: 200, body: { profile } };
  }

  public getProfileById(id: number): { status: number; body: unknown } {
    for (const p of this.profiles.values()) {
      if (p.id === id) {
        return { status: 200, body: { profile: p } };
      }
    }
    return {
      status: 404,
      body: { error: { code: 'not_found', message: 'Profil teman tim tidak ditemukan.', retryable: false } },
    };
  }

  public listProfiles(query: { major?: string; skill?: string; search?: string; looking_for_team?: string } = {}): {
    status: number;
    body: unknown;
  } {
    let results = Array.from(this.profiles.values());

    if (query.major) {
      const m = query.major.toLowerCase().trim();
      results = results.filter((p) => p.major.toLowerCase().includes(m));
    }

    if (query.skill) {
      const s = query.skill.toLowerCase().trim();
      results = results.filter((p) => p.skills.some((sk) => sk.toLowerCase().includes(s)));
    }

    if (query.search) {
      const q = query.search.toLowerCase().trim();
      results = results.filter(
        (p) =>
          p.full_name.toLowerCase().includes(q) ||
          (p.bio && p.bio.toLowerCase().includes(q)) ||
          p.skills.some((sk) => sk.toLowerCase().includes(q)),
      );
    }

    if (query.looking_for_team !== undefined && query.looking_for_team !== '') {
      const looking = query.looking_for_team === '1';
      results = results.filter((p) => (p.is_looking_for_team === 1) === looking);
    }

    return { status: 200, body: { profiles: results } };
  }

  // --- Study Pipeline (R4) ---

  public initiateOpportunityStudy(opportunityId: number): { status: number; body: unknown } {
    const opp = this.opportunities.get(opportunityId);
    if (!opp) {
      return {
        status: 404,
        body: { error: { code: 'not_found', message: 'Peluang tidak ditemukan.', retryable: false } },
      };
    }

    if (!opp.guideline_text && !opp.guideline_url) {
      return {
        status: 400,
        body: {
          error: {
            code: 'missing_guidelines',
            message: 'Peluang ini tidak memiliki lampiran buku panduan atau pedoman teknis.',
            retryable: false,
          },
        },
      };
    }

    const docId = this.nextDocumentId++;
    const docTitle = `Panduan: ${opp.title}`;
    const docContent = opp.guideline_text || `Sumber: ${opp.guideline_url}`;

    this.documents.set(docId, {
      id: docId,
      title: docTitle,
      content: docContent,
      status: 'ready',
    });

    const result: StudyPipelineResult = {
      document_id: docId,
      title: docTitle,
      status: 'ready',
      generated_items: {
        notes_count: 3,
        quizzes_count: 5,
        mindmap_nodes: 8,
      },
    };

    return { status: 200, body: result };
  }

  public getStudyDocument(docId: number): { status: number; body: unknown } {
    const doc = this.documents.get(docId);
    if (!doc) {
      return {
        status: 404,
        body: { error: { code: 'not_found', message: 'Dokumen belajar tidak ditemukan.', retryable: false } },
      };
    }
    return { status: 200, body: { document: doc } };
  }
}
