import { beforeEach, describe, expect, it } from 'vitest';
import { computeDeadlineState, shouldShowReminder } from './harness/contracts';
import {
  createTestHarness,
  getSampleCompetition,
  getSampleScholarship,
  inDays,
  inHours,
} from './harness/fixtures';

describe('Tier 4: Real-World Application Scenarios', () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(() => {
    harness = createTestHarness();
  });

  it('Scenario 1: Computer Science Sophomore Hackathon Discovery & Team Formation', async () => {
    // 1. Sophomore student sets up personal profile
    const profileRes = await harness.studentClient.updateMyProfile({
      full_name: 'Farhan Ramadhan',
      major: 'Informatika',
      batch_year: 2024,
      bio: 'Mahasiswa tingkat 2 tertarik dengan frontend engineering dan UI/UX.',
      skills: ['React', 'TypeScript', 'Tailwind'],
      is_looking_for_team: 1,
    });
    expect(profileRes.status).toBe(200);

    // 2. Candidate peer registers profile in system
    await harness.studentClientB.updateMyProfile({
      full_name: 'Rian Pratama',
      major: 'Informatika',
      batch_year: 2023,
      skills: ['Rust', 'Axum', 'PostgreSQL'],
      contact_info: { telegram: '@rian_rust' },
      is_looking_for_team: 1,
    });

    // 3. Admin publishes upcoming Hackathon
    const oppRes = await harness.adminClient.createOpportunity({
      title: 'Hackathon Web3 & AI Kampus 2026',
      description: 'Bangun dApp AI fullstack. Format tim 2-3 orang.',
      category: 'competition',
      organizer: 'Fakultas Ilmu Komputer',
      deadline: inDays(14),
      target_majors: ['Informatika', 'Sistem Informasi'],
      guideline_text: 'Ketentuan: Repositori Git publik dengan demo live.',
      is_published: 1,
    });
    const oppId = oppRes.data.opportunity!.id;

    // 4. Student discovers open hackathon for Informatika
    const catalogRes = await harness.studentClient.listOpportunities({
      category: 'competition',
      major: 'Informatika',
      status: 'open',
    });
    expect(catalogRes.data.opportunities?.some((o) => o.id === oppId)).toBe(true);

    // 5. Student searches peer directory for a backend partner with Rust skills
    const peerRes = await harness.studentClient.listProfiles({
      major: 'Informatika',
      skill: 'Rust',
      looking_for_team: '1',
    });
    expect(peerRes.data.profiles?.length).toBe(1);
    expect(peerRes.data.profiles?.[0]?.full_name).toBe('Rian Pratama');
    expect(peerRes.data.profiles?.[0]?.contact_info.telegram).toBe('@rian_rust');

    // 6. Student saves the competition to personal tracker
    const trackRes = await harness.studentClient.trackOpportunity(oppId);
    expect(trackRes.status).toBe(201);
    expect(trackRes.data.tracked?.status).toBe('Saved');

    // 7. Verify active 14-day countdown and reminder card state
    const deadlineState = computeDeadlineState(oppRes.data.opportunity!.deadline);
    expect(deadlineState.days).toBeGreaterThanOrEqual(13);
    expect(shouldShowReminder(trackRes.data.tracked!.status, deadlineState)).toBe(true);
  });

  it('Scenario 2: Scholarship Application with Guideline Study & Interview Preparation', async () => {
    // 1. Admin curates national scholarship with comprehensive guidelines
    const oppRes = await harness.adminClient.createOpportunity({
      title: 'Beasiswa Prestasi Masa Depan 2026',
      description: 'Program beasiswa pendidikan bagi mahasiswa berprestasi.',
      category: 'scholarship',
      organizer: 'Yayasan Masa Depan',
      deadline: inDays(20),
      target_majors: ['Informatika', 'Hukum', 'Manajemen'],
      guideline_text:
        'Pedoman Seleksi: Tahap 1 Administrasi berkas, Tahap 2 Esai motivasi 1000 kata, Tahap 3 Wawancara panel.',
      is_published: 1,
    });
    const oppId = oppRes.data.opportunity!.id;

    // 2. Student saves scholarship to tracker
    const trackRes = await harness.studentClient.trackOpportunity(oppId);
    const trackId = trackRes.data.tracked!.id;
    expect(trackRes.data.tracked?.status).toBe('Saved');

    // 3. Student initiates AI study pipeline on scholarship guidelines
    const studyRes = await harness.studentClient.initiateOpportunityStudy(oppId);
    expect(studyRes.status).toBe(200);
    expect(studyRes.data.status).toBe('ready');
    expect(studyRes.data.generated_items?.notes_count).toBeGreaterThan(0);
    expect(studyRes.data.generated_items?.quizzes_count).toBeGreaterThan(0);

    // 4. Student reviews generated study material via document_id
    const docRes = await harness.studentClient.getStudyDocument(studyRes.data.document_id);
    expect(docRes.data.document?.title).toContain('Beasiswa Prestasi Masa Depan');
    expect(docRes.data.document?.content).toContain('Tahap 3 Wawancara panel');

    // 5. Student submits application documents and updates tracker status to Applied
    const appliedRes = await harness.studentClient.updateTrackedStatus(trackId, 'Applied');
    expect(appliedRes.status).toBe(200);
    expect(appliedRes.data.tracked?.status).toBe('Applied');
    expect(appliedRes.data.tracked?.applied_at).toBeGreaterThan(0);

    // 6. Verify countdown notifications and reminder cards are immediately suppressed
    const deadlineCalc = computeDeadlineState(oppRes.data.opportunity!.deadline);
    expect(shouldShowReminder('Applied', deadlineCalc)).toBe(false);
  });

  it('Scenario 3: Urgent Deadline Triage (<24h countdown & reminder dismissal)', async () => {
    // 1. Admin publishes competition closing in 6 hours
    const urgentDeadline = inHours(6);
    const oppRes = await harness.adminClient.createOpportunity({
      title: 'Call for Papers Seminar Nasional Terakhir',
      category: 'competition',
      deadline: urgentDeadline,
      is_published: 1,
    });
    const oppId = oppRes.data.opportunity!.id;

    // 2. Student has item in Saved state
    const trackRes = await harness.studentClient.trackOpportunity(oppId);
    const trackId = trackRes.data.tracked!.id;

    // 3. Verify urgent alert triggers on dashboard
    const urgentCalc = computeDeadlineState(urgentDeadline);
    expect(urgentCalc.is_urgent).toBe(true);
    expect(urgentCalc.hours).toBe(6);
    expect(shouldShowReminder('Saved', urgentCalc)).toBe(true);

    // 4. Student rushes and completes submission, updates status to Applied
    const applyRes = await harness.studentClient.updateTrackedStatus(trackId, 'Applied');
    expect(applyRes.status).toBe(200);
    expect(applyRes.data.tracked?.status).toBe('Applied');

    // 5. Verify urgent alert is suppressed on dashboard
    expect(shouldShowReminder('Applied', urgentCalc)).toBe(false);
  });

  it('Scenario 4: Multi-Competition Dashboard Lifecycle Management (Saved, Applied, Done)', async () => {
    // 1. Create 3 distinct opportunities
    const o1 = await harness.adminClient.createOpportunity(getSampleCompetition(0));
    const o2 = await harness.adminClient.createOpportunity(getSampleCompetition(1));
    const o3 = await harness.adminClient.createOpportunity(getSampleScholarship(0));

    // 2. Student tracks all three
    const t1 = await harness.studentClient.trackOpportunity(o1.data.opportunity!.id);
    const t2 = await harness.studentClient.trackOpportunity(o2.data.opportunity!.id);
    const t3 = await harness.studentClient.trackOpportunity(o3.data.opportunity!.id);

    // 3. Move t2 to Applied and t3 to Done
    await harness.studentClient.updateTrackedStatus(t2.data.tracked!.id, 'Applied');
    await harness.studentClient.updateTrackedStatus(t3.data.tracked!.id, 'Applied');
    await harness.studentClient.updateTrackedStatus(t3.data.tracked!.id, 'Done');

    // 4. Verify Kanban/Dashboard queries return correct segregation
    const savedList = await harness.studentClient.listTracked('Saved');
    expect(savedList.data.tracked?.length).toBe(1);
    expect(savedList.data.tracked?.[0]?.id).toBe(t1.data.tracked!.id);

    const appliedList = await harness.studentClient.listTracked('Applied');
    expect(appliedList.data.tracked?.length).toBe(1);
    expect(appliedList.data.tracked?.[0]?.id).toBe(t2.data.tracked!.id);

    const doneList = await harness.studentClient.listTracked('Done');
    expect(doneList.data.tracked?.length).toBe(1);
    expect(doneList.data.tracked?.[0]?.id).toBe(t3.data.tracked!.id);

    // 5. Verify notification rules across the three items
    const calc1 = computeDeadlineState(o1.data.opportunity!.deadline);
    const calc2 = computeDeadlineState(o2.data.opportunity!.deadline);
    const calc3 = computeDeadlineState(o3.data.opportunity!.deadline);

    expect(shouldShowReminder('Saved', calc1)).toBe(true);
    expect(shouldShowReminder('Applied', calc2)).toBe(false);
    expect(shouldShowReminder('Done', calc3)).toBe(false);
  });

  it('Scenario 5: Admin Curation to Student Discovery & Teammate Outreach', async () => {
    // 1. Admin creates a new National Data Science Challenge
    const createRes = await harness.adminClient.createOpportunity({
      title: 'Olimpiade Sains Data & AI Nasional 2026',
      description: 'Lomba pemodelan prediktif machine learning untuk mahasiswa.',
      category: 'competition',
      organizer: 'Asosiasi Data Science Indonesia',
      deadline: inDays(35),
      target_majors: ['Informatika', 'Statistika', 'Sistem Informasi'],
      guideline_text: 'Format pengumpulan: Notebook Jupyter (.ipynb) dan ringkasan eksekutif PDF.',
      is_published: 1,
    });
    expect(createRes.status).toBe(201);
    const oppId = createRes.data.opportunity!.id;

    // 2. Peer student updates profile as a Data Scientist looking for a team
    await harness.studentClientB.updateMyProfile({
      full_name: 'Nadia Putri',
      major: 'Statistika',
      batch_year: 2024,
      skills: ['Python', 'Pandas', 'Machine Learning', 'Data Visualization'],
      contact_info: { email: 'nadia@kampus.ac.id', telegram: '@nadiadata' },
      is_looking_for_team: 1,
    });

    // 3. Primary student searches for data competitions
    const searchRes = await harness.studentClient.listOpportunities({
      category: 'competition',
      search: 'Sains Data',
    });
    expect(searchRes.data.opportunities?.some((o) => o.id === oppId)).toBe(true);

    // 4. Primary student triggers study pipeline to generate prep materials
    const studyRes = await harness.studentClient.initiateOpportunityStudy(oppId);
    expect(studyRes.status).toBe(200);
    expect(studyRes.data.document_id).toBeGreaterThan(0);

    // 5. Primary student finds teammate Nadia via peer directory
    const candidatesRes = await harness.studentClient.listProfiles({
      skill: 'Machine Learning',
      looking_for_team: '1',
    });
    expect(candidatesRes.data.profiles?.some((p) => p.full_name === 'Nadia Putri')).toBe(true);

    // 6. Student saves opportunity to personal tracker
    const trackRes = await harness.studentClient.trackOpportunity(oppId);
    expect(trackRes.status).toBe(201);
    expect(trackRes.data.tracked?.opportunity_id).toBe(oppId);
  });
});
