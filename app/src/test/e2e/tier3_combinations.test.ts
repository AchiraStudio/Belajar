import { beforeEach, describe, expect, it } from 'vitest';
import { computeDeadlineState, shouldShowReminder } from './harness/contracts';
import {
  createTestHarness,
  getSampleCompetition,
  getSampleProfile,
  getSampleScholarship,
  inDays,
  inHours,
  nowSecs,
} from './harness/fixtures';

describe('Tier 3: Cross-Feature Pairwise Combinations', () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(() => {
    harness = createTestHarness();
  });

  it('1. Opportunities Filter -> Save to Track -> Reminder Calculation & Dashboard Alert', async () => {
    // Admin creates open competition
    await harness.adminClient.createOpportunity(getSampleCompetition(0)); // Gemastik, 30 days deadline

    // Student filters by major
    const searchRes = await harness.studentClient.listOpportunities({ major: 'Informatika' });
    expect(searchRes.status).toBe(200);
    const opp = searchRes.data.opportunities?.[0];
    expect(opp).toBeDefined();

    // Student saves to track
    const trackRes = await harness.studentClient.trackOpportunity(opp!.id);
    expect(trackRes.status).toBe(201);
    const trackedItem = trackRes.data.tracked!;
    expect(trackedItem.status).toBe('Saved');

    // Verify reminder & countdown states
    const deadlineState = computeDeadlineState(opp!.deadline);
    expect(deadlineState.is_expired).toBe(false);
    expect(deadlineState.days).toBeGreaterThanOrEqual(29);
    expect(shouldShowReminder(trackedItem.status, deadlineState)).toBe(true);
  });

  it('2. Saved Opportunity -> Teammate Matching by Target Major & Skills', async () => {
    // Seed peer profiles
    await harness.studentClientB.updateMyProfile(getSampleProfile(0)); // Budi: major Informatika, skills: React, TypeScript, Figma

    // Seed competition requiring Informatika
    const opp = await harness.adminClient.createOpportunity(getSampleCompetition(1)); // Hackathon AI, major Informatika
    const oppId = opp.data.opportunity!.id;

    // Student saves opportunity
    await harness.studentClient.trackOpportunity(oppId);

    // Student searches for candidates in Informatics with React skills
    const matchRes = await harness.studentClient.listProfiles({
      major: 'Informatika',
      skill: 'React',
      looking_for_team: '1',
    });

    expect(matchRes.status).toBe(200);
    const candidates = matchRes.data.profiles || [];
    expect(candidates.length).toBe(1);
    expect(candidates[0]?.full_name).toBe('Budi Santoso');
    expect(candidates[0]?.skills).toContain('React');
  });

  it('3. Opportunity Guidelines -> AI Study Tools Document Creation & Linkage', async () => {
    // Admin publishes opportunity with comprehensive guidelines
    const opp = await harness.adminClient.createOpportunity({
      title: 'Lomba Esai Nasional Ilmiah 2026',
      category: 'competition',
      deadline: inDays(20),
      guideline_text: 'Pedoman Penulisan: Struktur bab 1 pendahuluan, bab 2 tinjauan pustaka, bab 3 metodologi.',
      is_published: 1,
    });
    const oppId = opp.data.opportunity!.id;

    // Student saves to tracker
    await harness.studentClient.trackOpportunity(oppId);

    // Student triggers AI study pipeline
    const studyRes = await harness.studentClient.initiateOpportunityStudy(oppId);
    expect(studyRes.status).toBe(200);
    expect(studyRes.data.status).toBe('ready');
    const docId = studyRes.data.document_id;

    // Verify study document is accessible
    const docRes = await harness.studentClient.getStudyDocument(docId);
    expect(docRes.status).toBe(200);
    expect(docRes.data.document?.title).toContain('Lomba Esai Nasional');
    expect(docRes.data.document?.content).toContain('Struktur bab 1 pendahuluan');
  });

  it('4. Admin Publish/Unpublish -> Student Search Visibility -> Track Eligibility', async () => {
    // Admin creates unpublished opportunity
    const oppRes = await harness.adminClient.createOpportunity({
      title: 'Beasiswa Pertukaran Mahasiswa Luar Negeri',
      category: 'scholarship',
      deadline: inDays(60),
      is_published: 0,
    });
    const oppId = oppRes.data.opportunity!.id;

    // Student cannot find it in search
    const studentSearch1 = await harness.studentClient.listOpportunities({ search: 'Pertukaran' });
    expect(studentSearch1.data.opportunities?.find((o) => o.id === oppId)).toBeUndefined();

    // Admin publishes the opportunity
    const publishRes = await harness.adminClient.updateOpportunity(oppId, { is_published: 1 });
    expect(publishRes.status).toBe(200);
    expect(publishRes.data.opportunity?.is_published).toBe(1);

    // Student now discovers and tracks it
    const studentSearch2 = await harness.studentClient.listOpportunities({ search: 'Pertukaran' });
    expect(studentSearch2.data.opportunities?.find((o) => o.id === oppId)).toBeDefined();

    const trackRes = await harness.studentClient.trackOpportunity(oppId);
    expect(trackRes.status).toBe(201);
  });

  it('5. Urgent Deadline Notification (<24h) -> Status Transition to Applied -> Immediate Reminder Suppression', async () => {
    // Create opportunity closing in 10 hours
    const urgentDeadline = inHours(10);
    const opp = await harness.adminClient.createOpportunity({
      title: 'Deadline Mendesak Lomba Poster',
      category: 'competition',
      deadline: urgentDeadline,
      is_published: 1,
    });
    const oppId = opp.data.opportunity!.id;

    // Student saves to tracker
    const trackRes = await harness.studentClient.trackOpportunity(oppId);
    const trackId = trackRes.data.tracked!.id;

    // Check urgent reminder state while Saved
    const urgentCalc = computeDeadlineState(urgentDeadline);
    expect(urgentCalc.is_urgent).toBe(true);
    expect(shouldShowReminder('Saved', urgentCalc)).toBe(true);

    // Student finishes submission and marks Applied
    const appliedRes = await harness.studentClient.updateTrackedStatus(trackId, 'Applied');
    expect(appliedRes.status).toBe(200);
    expect(appliedRes.data.tracked?.status).toBe('Applied');

    // Reminder must be suppressed now even though deadline is still urgent (<24h)
    expect(shouldShowReminder(appliedRes.data.tracked!.status, urgentCalc)).toBe(false);
  });

  it('6. Status Transition to Done -> Permanent Reminder Suppression & Completion Timestamp', async () => {
    const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
    const trackRes = await harness.studentClient.trackOpportunity(opp.data.opportunity!.id);
    const trackId = trackRes.data.tracked!.id;

    // Advance directly to Done
    const doneRes = await harness.studentClient.updateTrackedStatus(trackId, 'Done');
    expect(doneRes.status).toBe(200);
    expect(doneRes.data.tracked?.status).toBe('Done');
    expect(doneRes.data.tracked?.completed_at).toBeGreaterThan(0);

    const deadlineCalc = computeDeadlineState(opp.data.opportunity!.deadline);
    expect(shouldShowReminder('Done', deadlineCalc)).toBe(false);
  });

  it('7. Peer Profile Real-Time Update -> Live Directory Matching Reflection', async () => {
    // Student B creates initial profile with Python
    await harness.studentClientB.updateMyProfile({
      full_name: 'Doni Pratama',
      major: 'Informatika',
      skills: ['Python'],
      is_looking_for_team: 1,
    });

    // Query for Rust skill returns nothing
    const queryBefore = await harness.studentClient.listProfiles({ skill: 'Rust' });
    expect(queryBefore.data.profiles?.length).toBe(0);

    // Student B updates profile with Rust
    await harness.studentClientB.updateMyProfile({
      skills: ['Python', 'Rust', 'Tokio'],
    });

    // Query for Rust now immediately matches Student B
    const queryAfter = await harness.studentClient.listProfiles({ skill: 'Rust' });
    expect(queryAfter.status).toBe(200);
    expect(queryAfter.data.profiles?.length).toBe(1);
    expect(queryAfter.data.profiles?.[0]?.full_name).toBe('Doni Pratama');
  });

  it('8. Multi-Criterion Compound Opportunity Filtering (Category + Major + Search + Status)', async () => {
    await harness.adminClient.createOpportunity(getSampleCompetition(0)); // Gemastik (competition, Informatika, Puspresnas)
    await harness.adminClient.createOpportunity(getSampleCompetition(1)); // Hackathon AI (competition, Informatika, Tech Innovators)
    await harness.adminClient.createOpportunity(getSampleScholarship(0)); // Beasiswa (scholarship, Informatika)

    const res = await harness.studentClient.listOpportunities({
      category: 'competition',
      major: 'Informatika',
      search: 'Gemastik',
      status: 'open',
    });

    expect(res.status).toBe(200);
    const list = res.data.opportunities || [];
    expect(list.length).toBe(1);
    expect(list[0]?.title).toBe('Gemastik XVII Bidang Pemrograman');
  });

  it('9. Concurrent Multi-Item Tracking with Mixed Statuses (Saved, Applied, Done)', async () => {
    const opp1 = await harness.adminClient.createOpportunity(getSampleCompetition(0));
    const opp2 = await harness.adminClient.createOpportunity(getSampleCompetition(1));
    const opp3 = await harness.adminClient.createOpportunity(getSampleScholarship(0));

    const t1 = await harness.studentClient.trackOpportunity(opp1.data.opportunity!.id);
    const t2 = await harness.studentClient.trackOpportunity(opp2.data.opportunity!.id);
    const t3 = await harness.studentClient.trackOpportunity(opp3.data.opportunity!.id);

    // Set t2 to Applied, t3 to Done
    await harness.studentClient.updateTrackedStatus(t2.data.tracked!.id, 'Applied');
    await harness.studentClient.updateTrackedStatus(t3.data.tracked!.id, 'Done');

    const allTracked = await harness.studentClient.listTracked();
    expect(allTracked.status).toBe(200);
    const items = allTracked.data.tracked || [];
    expect(items.length).toBe(3);

    const saved = items.find((i) => i.status === 'Saved');
    const applied = items.find((i) => i.status === 'Applied');
    const done = items.find((i) => i.status === 'Done');

    expect(saved).toBeDefined();
    expect(applied).toBeDefined();
    expect(done).toBeDefined();

    expect(saved?.applied_at).toBeNull();
    expect(applied?.applied_at).toBeGreaterThan(0);
    expect(done?.completed_at).toBeGreaterThan(0);
  });

  it('10. Opportunity Deletion by Admin Cleans Tracker Entries Without Crashing', async () => {
    const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
    const oppId = opp.data.opportunity!.id;

    // Student tracks it
    const trackRes = await harness.studentClient.trackOpportunity(oppId);
    expect(trackRes.status).toBe(201);
    const trackId = trackRes.data.tracked!.id;

    // Admin deletes opportunity
    const delOpp = await harness.adminClient.deleteOpportunity(oppId);
    expect(delOpp.status).toBe(200);

    // Student tracker list handles the deletion cleanly
    const trackedList = await harness.studentClient.listTracked();
    expect(trackedList.status).toBe(200);
    expect(trackedList.data.tracked?.find((t) => t.id === trackId)).toBeUndefined();
  });
});
