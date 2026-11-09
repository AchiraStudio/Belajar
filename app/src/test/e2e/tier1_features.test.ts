import { beforeEach, describe, expect, it } from 'vitest';
import { computeDeadlineState, shouldShowReminder } from './harness/contracts';
import {
  createTestHarness,
  getSampleCompetition,
  getSampleProfile,
  getSampleScholarship,
  inDays,
  nowSecs,
} from './harness/fixtures';

describe('Tier 1: Feature Coverage (R1 - R4)', () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(() => {
    harness = createTestHarness();
  });

  // ==========================================
  // R1: Opportunities Aggregator
  // ==========================================
  describe('R1: Opportunities Aggregator', () => {
    it('admin can create competition listing with deadline and target majors', async () => {
      const res = await harness.adminClient.createOpportunity({
        title: 'Gemastik XVII Bidang Pemrograman',
        description: 'Kompetisi pemrograman tahunan tingkat nasional.',
        category: 'competition',
        organizer: 'Puspresnas Kemdikbudristek',
        deadline: inDays(30),
        target_majors: ['Informatika', 'Sistem Informasi'],
        guideline_text: 'Pedoman Teknis Gemastik: Tim terdiri dari 3 mahasiswa.',
        is_published: 1,
      });

      expect(res.status).toBe(201);
      expect(res.data.opportunity).toBeDefined();
      expect(res.data.opportunity?.title).toBe('Gemastik XVII Bidang Pemrograman');
      expect(res.data.opportunity?.category).toBe('competition');
      expect(res.data.opportunity?.target_majors).toEqual(['Informatika', 'Sistem Informasi']);
      expect(res.data.opportunity?.is_published).toBe(1);
    });

    it('admin can create scholarship listing with guidelines and organizer', async () => {
      const res = await harness.adminClient.createOpportunity({
        title: 'Beasiswa Unggulan Mahasiswa Berprestasi 2026',
        description: 'Bantuan biaya kuliah penuh bagi mahasiswa berprestasi.',
        category: 'scholarship',
        organizer: 'Kementerian Pendidikan',
        deadline: inDays(45),
        target_majors: ['Informatika', 'Hukum', 'Manajemen'],
        guideline_text: 'Wajib melampirkan esai dan sertifikat prestasi.',
        is_published: 1,
      });

      expect(res.status).toBe(201);
      expect(res.data.opportunity?.category).toBe('scholarship');
      expect(res.data.opportunity?.organizer).toBe('Kementerian Pendidikan');
      expect(res.data.opportunity?.guideline_text).toContain('Wajib melampirkan esai');
    });

    it('students can list and filter opportunities by academic major', async () => {
      // Seed opportunities
      await harness.adminClient.createOpportunity(getSampleCompetition(0)); // Informatika, Sistem Informasi
      await harness.adminClient.createOpportunity(getSampleCompetition(2)); // Open to all (empty target_majors)
      await harness.adminClient.createOpportunity({
        title: 'Olimpiade Kedokteran Nasional',
        category: 'competition',
        deadline: inDays(15),
        target_majors: ['Kedokteran', 'Farmasi'],
        is_published: 1,
      });

      const res = await harness.studentClient.listOpportunities({ major: 'Informatika' });

      expect(res.status).toBe(200);
      const list = res.data.opportunities || [];
      expect(list.length).toBe(2); // Should include Gemastik and Debat (open to all)
      const titles = list.map((o) => o.title);
      expect(titles).toContain('Gemastik XVII Bidang Pemrograman');
      expect(titles).toContain('Kompetisi Debat Bahasa Inggris Mahasiswa');
      expect(titles).not.toContain('Olimpiade Kedokteran Nasional');
    });

    it('students can filter opportunities by category and search query', async () => {
      await harness.adminClient.createOpportunity(getSampleCompetition(0));
      await harness.adminClient.createOpportunity(getSampleScholarship(0));
      await harness.adminClient.createOpportunity(getSampleScholarship(1));

      const res = await harness.studentClient.listOpportunities({
        category: 'scholarship',
        search: 'Djarum',
      });

      expect(res.status).toBe(200);
      const list = res.data.opportunities || [];
      expect(list.length).toBe(1);
      expect(list[0]?.title).toContain('Djarum Beasiswa Plus');
    });

    it('admin can update opportunity details', async () => {
      const created = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const oppId = created.data.opportunity!.id;

      const newDeadline = inDays(60);
      const updateRes = await harness.adminClient.updateOpportunity(oppId, {
        title: 'Gemastik XVII Bidang Pemrograman (Updated)',
        deadline: newDeadline,
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.data.opportunity?.title).toBe('Gemastik XVII Bidang Pemrograman (Updated)');
      expect(updateRes.data.opportunity?.deadline).toBe(newDeadline);

      const fetchRes = await harness.studentClient.getOpportunity(oppId);
      expect(fetchRes.data.opportunity?.title).toBe('Gemastik XVII Bidang Pemrograman (Updated)');
    });

    it('admin can delete opportunity listing', async () => {
      const created = await harness.adminClient.createOpportunity(getSampleCompetition(1));
      const oppId = created.data.opportunity!.id;

      const delRes = await harness.adminClient.deleteOpportunity(oppId);
      expect(delRes.status).toBe(200);
      expect(delRes.data.ok).toBe(true);

      const fetchRes = await harness.studentClient.getOpportunity(oppId);
      expect(fetchRes.status).toBe(404);
    });

    it('student cannot see unpublished opportunity in catalog', async () => {
      const created = await harness.adminClient.createOpportunity({
        title: 'Draft Lomba Belum Rilis',
        category: 'competition',
        deadline: inDays(10),
        is_published: 0,
      });
      const oppId = created.data.opportunity!.id;

      // Student search does not see it
      const studentRes = await harness.studentClient.listOpportunities();
      expect(studentRes.data.opportunities?.find((o) => o.id === oppId)).toBeUndefined();

      // Admin list does see it
      const adminRes = await harness.adminClient.listOpportunities();
      expect(adminRes.data.opportunities?.find((o) => o.id === oppId)).toBeDefined();
    });
  });

  // ==========================================
  // R2: Save-to-Track Lifecycle & Reminders
  // ==========================================
  describe('R2: Save-to-Track Lifecycle & Reminders', () => {
    it('student can save open opportunity to personal tracker with initial Saved status', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const oppId = opp.data.opportunity!.id;

      const trackRes = await harness.studentClient.trackOpportunity(oppId);

      expect(trackRes.status).toBe(201);
      expect(trackRes.data.tracked).toBeDefined();
      expect(trackRes.data.tracked?.opportunity_id).toBe(oppId);
      expect(trackRes.data.tracked?.status).toBe('Saved');
      expect(trackRes.data.tracked?.applied_at).toBeNull();
      expect(trackRes.data.tracked?.completed_at).toBeNull();
    });

    it('student can update tracked item to Applied status with timestamp', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const oppId = opp.data.opportunity!.id;
      const trackRes = await harness.studentClient.trackOpportunity(oppId);
      const trackId = trackRes.data.tracked!.id;

      const updateRes = await harness.studentClient.updateTrackedStatus(trackId, 'Applied');

      expect(updateRes.status).toBe(200);
      expect(updateRes.data.tracked?.status).toBe('Applied');
      expect(updateRes.data.tracked?.applied_at).toBeGreaterThan(0);
      expect(updateRes.data.tracked?.completed_at).toBeNull();
    });

    it('student can update tracked item to Done status with completion timestamp', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const oppId = opp.data.opportunity!.id;
      const trackRes = await harness.studentClient.trackOpportunity(oppId);
      const trackId = trackRes.data.tracked!.id;

      await harness.studentClient.updateTrackedStatus(trackId, 'Applied');
      const doneRes = await harness.studentClient.updateTrackedStatus(trackId, 'Done');

      expect(doneRes.status).toBe(200);
      expect(doneRes.data.tracked?.status).toBe('Done');
      expect(doneRes.data.tracked?.completed_at).toBeGreaterThan(0);
    });

    it('student can filter tracked opportunities by status', async () => {
      const opp1 = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const opp2 = await harness.adminClient.createOpportunity(getSampleScholarship(0));

      const t1 = await harness.studentClient.trackOpportunity(opp1.data.opportunity!.id);
      const t2 = await harness.studentClient.trackOpportunity(opp2.data.opportunity!.id);

      // t1 remains Saved, t2 advances to Applied
      await harness.studentClient.updateTrackedStatus(t2.data.tracked!.id, 'Applied');

      const savedRes = await harness.studentClient.listTracked('Saved');
      expect(savedRes.status).toBe(200);
      expect(savedRes.data.tracked?.length).toBe(1);
      expect(savedRes.data.tracked?.[0]?.id).toBe(t1.data.tracked!.id);

      const appliedRes = await harness.studentClient.listTracked('Applied');
      expect(appliedRes.status).toBe(200);
      expect(appliedRes.data.tracked?.length).toBe(1);
      expect(appliedRes.data.tracked?.[0]?.id).toBe(t2.data.tracked!.id);
    });

    it('student can delete tracked item from tracker', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const trackRes = await harness.studentClient.trackOpportunity(opp.data.opportunity!.id);
      const trackId = trackRes.data.tracked!.id;

      const delRes = await harness.studentClient.deleteTracked(trackId);
      expect(delRes.status).toBe(200);
      expect(delRes.data.ok).toBe(true);

      const listRes = await harness.studentClient.listTracked();
      expect(listRes.data.tracked?.find((t) => t.id === trackId)).toBeUndefined();
    });

    it('reminders and countdown are active for Saved and suppressed for Applied or Done', () => {
      const futureDeadline = nowSecs() + 7 * 86400; // 7 days in future
      const deadlineCalc = computeDeadlineState(futureDeadline);

      expect(deadlineCalc.is_expired).toBe(false);
      expect(deadlineCalc.days).toBe(7);

      // Reminder active for Saved
      expect(shouldShowReminder('Saved', deadlineCalc)).toBe(true);

      // Reminder suppressed for Applied
      expect(shouldShowReminder('Applied', deadlineCalc)).toBe(false);

      // Reminder suppressed for Done
      expect(shouldShowReminder('Done', deadlineCalc)).toBe(false);
    });
  });

  // ==========================================
  // R3: Peer Profiles & Teammate Matching
  // ==========================================
  describe('R3: Peer Profiles & Teammate Matching', () => {
    it('student can initialize and retrieve own profile', async () => {
      const res = await harness.studentClient.getMyProfile();

      expect(res.status).toBe(200);
      expect(res.data.profile).toBeDefined();
      expect(res.data.profile?.user_id).toBe(harness.studentClient.getSession().userId);
      expect(res.data.profile?.major).toBeDefined();
    });

    it('student can update profile with major, skills, and academic interests', async () => {
      const res = await harness.studentClient.updateMyProfile({
        full_name: 'Ahmad Faiz',
        major: 'Informatika',
        batch_year: 2024,
        bio: 'Fullstack developer bersemangat mengikuti lomba hackathon.',
        academic_interests: ['Artificial Intelligence', 'Web Engineering'],
        skills: ['React', 'TypeScript', 'Node.js', 'Rust'],
        contact_info: { email: 'faiz@kampus.ac.id', telegram: '@faizdev' },
        is_looking_for_team: 1,
      });

      expect(res.status).toBe(200);
      expect(res.data.profile?.full_name).toBe('Ahmad Faiz');
      expect(res.data.profile?.skills).toEqual(['React', 'TypeScript', 'Node.js', 'Rust']);
      expect(res.data.profile?.contact_info.telegram).toBe('@faizdev');
    });

    it('students can search teammates filtered by major', async () => {
      await harness.studentClient.updateMyProfile(getSampleProfile(0)); // Informatika
      await harness.studentClientB.updateMyProfile(getSampleProfile(2)); // Sistem Informasi

      const res = await harness.studentClient.listProfiles({ major: 'Informatika' });

      expect(res.status).toBe(200);
      const profiles = res.data.profiles || [];
      expect(profiles.length).toBe(1);
      expect(profiles[0]?.full_name).toBe('Budi Santoso');
    });

    it('students can search teammates filtered by skill tag', async () => {
      await harness.studentClient.updateMyProfile(getSampleProfile(0)); // skills: React, TypeScript, Tailwind, Figma
      await harness.studentClientB.updateMyProfile(getSampleProfile(1)); // skills: Rust, PostgreSQL, Docker, Axum

      const res = await harness.studentClient.listProfiles({ skill: 'Rust' });

      expect(res.status).toBe(200);
      const profiles = res.data.profiles || [];
      expect(profiles.length).toBe(1);
      expect(profiles[0]?.full_name).toBe('Siti Rahma');
    });

    it('students can filter teammates by looking for team availability', async () => {
      await harness.studentClient.updateMyProfile({
        full_name: 'Mahasiswa Sibuk',
        major: 'Informatika',
        is_looking_for_team: 0,
      });
      await harness.studentClientB.updateMyProfile({
        full_name: 'Mahasiswa Siap Lomba',
        major: 'Informatika',
        is_looking_for_team: 1,
      });

      const res = await harness.studentClient.listProfiles({ looking_for_team: '1' });

      expect(res.status).toBe(200);
      const available = res.data.profiles || [];
      expect(available.some((p) => p.full_name === 'Mahasiswa Siap Lomba')).toBe(true);
      expect(available.some((p) => p.full_name === 'Mahasiswa Sibuk')).toBe(false);
    });

    it('student can retrieve peer profile details by ID', async () => {
      const updateRes = await harness.studentClientB.updateMyProfile(getSampleProfile(1));
      const profileId = updateRes.data.profile!.id;

      const getRes = await harness.studentClient.getProfileById(profileId);

      expect(getRes.status).toBe(200);
      expect(getRes.data.profile?.id).toBe(profileId);
      expect(getRes.data.profile?.full_name).toBe('Siti Rahma');
      expect(getRes.data.profile?.contact_info.email).toBe('siti@kampus.ac.id');
    });
  });

  // ==========================================
  // R4: Competition Guidelines Study Pipeline
  // ==========================================
  describe('R4: Study Pipeline Integration', () => {
    it('student can initiate study material generation from opportunity guidelines', async () => {
      const opp = await harness.adminClient.createOpportunity({
        title: 'Kompetisi Inovasi Bisnis Mahasiswa 2026',
        category: 'competition',
        deadline: inDays(25),
        guideline_text: 'Pedoman Lomba: Peserta menyusun business model canvas dan executive summary 5 halaman.',
        is_published: 1,
      });
      const oppId = opp.data.opportunity!.id;

      const studyRes = await harness.studentClient.initiateOpportunityStudy(oppId);

      expect(studyRes.status).toBe(200);
      expect(studyRes.data.status).toBe('ready');
      expect(studyRes.data.document_id).toBeGreaterThan(0);
      expect(studyRes.data.title).toContain('Kompetisi Inovasi Bisnis');
    });

    it('study pipeline generates AI note summaries from guidelines', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const studyRes = await harness.studentClient.initiateOpportunityStudy(opp.data.opportunity!.id);

      expect(studyRes.data.generated_items?.notes_count).toBeGreaterThan(0);
    });

    it('study pipeline generates practice quizzes from guidelines', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const studyRes = await harness.studentClient.initiateOpportunityStudy(opp.data.opportunity!.id);

      expect(studyRes.data.generated_items?.quizzes_count).toBeGreaterThan(0);
    });

    it('study pipeline generates mind map concept structure', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const studyRes = await harness.studentClient.initiateOpportunityStudy(opp.data.opportunity!.id);

      expect(studyRes.data.generated_items?.mindmap_nodes).toBeGreaterThan(0);
    });

    it('study pipeline document is accessible in study tools by document_id', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const studyRes = await harness.studentClient.initiateOpportunityStudy(opp.data.opportunity!.id);
      const docId = studyRes.data.document_id;

      const docRes = await harness.studentClient.getStudyDocument(docId);

      expect(docRes.status).toBe(200);
      expect(docRes.data.document?.id).toBe(docId);
      expect(docRes.data.document?.content).toContain('Pedoman Teknis Gemastik');
    });

    it('study pipeline rejects opportunity without guidelines', async () => {
      const oppNoGuideline = await harness.adminClient.createOpportunity({
        title: 'Kompetisi Tanpa Panduan',
        category: 'competition',
        deadline: inDays(10),
        guideline_text: null,
        guideline_url: null,
        is_published: 1,
      });

      const studyRes = await harness.studentClient.initiateOpportunityStudy(oppNoGuideline.data.opportunity!.id);

      expect(studyRes.status).toBe(400);
      expect(studyRes.data.error?.code).toBe('missing_guidelines');
    });
  });
});
