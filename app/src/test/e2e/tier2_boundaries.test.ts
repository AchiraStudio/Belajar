import { beforeEach, describe, expect, it } from 'vitest';
import { computeDeadlineState, shouldShowReminder } from './harness/contracts';
import {
  agoDays,
  createTestHarness,
  getSampleCompetition,
  inDays,
  inHours,
  nowSecs,
} from './harness/fixtures';

describe('Tier 2: Boundary & Corner Cases', () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(() => {
    harness = createTestHarness();
  });

  // ==========================================
  // Boundary 1: Deadline & Countdown Boundaries
  // ==========================================
  describe('Boundary 1: Deadline & Countdown Boundaries', () => {
    it('deadline in the past (deadline < now) is marked expired with 0 remaining seconds', () => {
      const pastDeadline = agoDays(2);
      const calc = computeDeadlineState(pastDeadline);

      expect(calc.is_expired).toBe(true);
      expect(calc.seconds_remaining).toBe(0);
      expect(calc.days).toBe(0);
      expect(calc.hours).toBe(0);
      expect(calc.minutes).toBe(0);
      expect(calc.formatted_countdown).toBe('0d 0h 0m');
      expect(calc.is_urgent).toBe(false);
      expect(shouldShowReminder('Saved', calc)).toBe(false);
    });

    it('deadline exactly at the current second (deadline == now) immediately marks expired', () => {
      const currentSec = nowSecs();
      const calc = computeDeadlineState(currentSec, currentSec);

      expect(calc.is_expired).toBe(true);
      expect(calc.seconds_remaining).toBe(0);
      expect(shouldShowReminder('Saved', calc)).toBe(false);
    });

    it('urgent deadline (< 24h remaining) flags is_urgent = true', () => {
      const urgentDeadline = nowSecs() + 12 * 3600; // 12 hours remaining
      const calc = computeDeadlineState(urgentDeadline);

      expect(calc.is_expired).toBe(false);
      expect(calc.is_urgent).toBe(true);
      expect(calc.hours).toBe(12);
      expect(shouldShowReminder('Saved', calc)).toBe(true);
    });

    it('deadline at exactly 23 hours 59 minutes (86340s) triggers urgent state', () => {
      const now = 1700000000;
      const calc = computeDeadlineState(now + 86340, now);

      expect(calc.is_urgent).toBe(true);
      expect(calc.days).toBe(0);
      expect(calc.hours).toBe(23);
      expect(calc.minutes).toBe(59);
    });

    it('deadline at exactly 24 hours (86400s) is non-urgent boundary', () => {
      const now = 1700000000;
      const calc = computeDeadlineState(now + 86400, now);

      expect(calc.is_urgent).toBe(false);
      expect(calc.days).toBe(1);
      expect(calc.hours).toBe(0);
      expect(calc.minutes).toBe(0);
    });

    it('long-range deadline (> 1 year, 400 days) handles large values without overflow', () => {
      const now = 1700000000;
      const calc = computeDeadlineState(now + 400 * 86400, now);

      expect(calc.is_expired).toBe(false);
      expect(calc.days).toBe(400);
      expect(calc.formatted_countdown).toContain('400d');
    });
  });

  // ==========================================
  // Boundary 2: Major & Category Boundaries
  // ==========================================
  describe('Boundary 2: Major & Category Boundaries', () => {
    it('empty target_majors array signifies open to all majors', async () => {
      await harness.adminClient.createOpportunity({
        title: 'Kompetisi Terbuka untuk Semua Jurusan',
        category: 'competition',
        deadline: inDays(20),
        target_majors: [], // empty = all majors
        is_published: 1,
      });

      const resInformatika = await harness.studentClient.listOpportunities({ major: 'Informatika' });
      const resKedokteran = await harness.studentClient.listOpportunities({ major: 'Kedokteran' });

      expect(resInformatika.data.opportunities?.some((o) => o.title.includes('Semua Jurusan'))).toBe(true);
      expect(resKedokteran.data.opportunities?.some((o) => o.title.includes('Semua Jurusan'))).toBe(true);
    });

    it('major filter matches with whitespace padding and mixed case', async () => {
      await harness.adminClient.createOpportunity({
        title: 'Lomba Rekayasa Perangkat Lunak',
        category: 'competition',
        deadline: inDays(15),
        target_majors: ['Informatika'],
        is_published: 1,
      });

      const res = await harness.studentClient.listOpportunities({ major: '   iNfOrMaTiKa   ' });

      expect(res.status).toBe(200);
      expect(res.data.opportunities?.some((o) => o.title.includes('Rekayasa'))).toBe(true);
    });

    it('querying non-existent major returns empty array cleanly without error', async () => {
      await harness.adminClient.createOpportunity(getSampleCompetition(0));

      const res = await harness.studentClient.listOpportunities({ major: 'Astronomi Antariksa' });

      expect(res.status).toBe(200);
      expect(res.data.opportunities).toEqual([]);
    });

    it('filtering by non-standard category returns empty results without crashing', async () => {
      await harness.adminClient.createOpportunity(getSampleCompetition(0));

      const res = await harness.studentClient.listOpportunities({ category: 'internship_unknown' });

      expect(res.status).toBe(200);
      expect(res.data.opportunities).toEqual([]);
    });

    it('multi-major targeting isolates specific majors correctly', async () => {
      await harness.adminClient.createOpportunity({
        title: 'Lomba Robotika Nasional',
        category: 'competition',
        deadline: inDays(25),
        target_majors: ['Teknik Elektro', 'Teknik Komputer'],
        is_published: 1,
      });

      const elektroRes = await harness.studentClient.listOpportunities({ major: 'Teknik Elektro' });
      const hukumRes = await harness.studentClient.listOpportunities({ major: 'Ilmu Hukum' });

      expect(elektroRes.data.opportunities?.some((o) => o.title.includes('Robotika'))).toBe(true);
      expect(hukumRes.data.opportunities?.some((o) => o.title.includes('Robotika'))).toBe(false);
    });

    it('major filter handles special characters and symbols safely', async () => {
      await harness.adminClient.createOpportunity({
        title: 'Kompetisi UI/UX & Web',
        category: 'competition',
        deadline: inDays(10),
        target_majors: ['Desain Komunikasi Visual (DKV)', 'Teknik Informatika (S-1)'],
        is_published: 1,
      });

      const res = await harness.studentClient.listOpportunities({ major: 'Desain Komunikasi Visual (DKV)' });

      expect(res.status).toBe(200);
      expect(res.data.opportunities?.length).toBe(1);
    });
  });

  // ==========================================
  // Boundary 3: Skill Tags & Peer Profile Boundaries
  // ==========================================
  describe('Boundary 3: Skill Tags & Peer Profile Boundaries', () => {
    it('empty skill tags array is accepted on peer profile', async () => {
      const res = await harness.studentClient.updateMyProfile({
        full_name: 'Mahasiswa Baru',
        major: 'Informatika',
        skills: [],
      });

      expect(res.status).toBe(200);
      expect(res.data.profile?.skills).toEqual([]);
    });

    it('exactly 20 skill tags boundary is accepted', async () => {
      const twentySkills = Array.from({ length: 20 }, (_, i) => `Skill-${i + 1}`);
      const res = await harness.studentClient.updateMyProfile({
        full_name: 'Mahasiswa Berbakat',
        skills: twentySkills,
      });

      expect(res.status).toBe(200);
      expect(res.data.profile?.skills.length).toBe(20);
    });

    it('exceeding 20 skill tags boundary (21 skills) is rejected with skill_limit_exceeded', async () => {
      const twentyOneSkills = Array.from({ length: 21 }, (_, i) => `Skill-${i + 1}`);
      const res = await harness.studentClient.updateMyProfile({
        full_name: 'Mahasiswa Terlalu Banyak Skill',
        skills: twentyOneSkills,
      });

      expect(res.status).toBe(400);
      expect(res.data.error?.code).toBe('skill_limit_exceeded');
    });

    it('biography at exactly 2000 chars is accepted and 2001 chars is rejected', async () => {
      const maxBio = 'A'.repeat(2000);
      const passRes = await harness.studentClient.updateMyProfile({ bio: maxBio });
      expect(passRes.status).toBe(200);
      expect(passRes.data.profile?.bio?.length).toBe(2000);

      const tooLongBio = 'A'.repeat(2001);
      const failRes = await harness.studentClient.updateMyProfile({ bio: tooLongBio });
      expect(failRes.status).toBe(400);
      expect(failRes.data.error?.code).toBe('bio_too_long');
    });

    it('batch year boundary conditions (1950 - 2100)', async () => {
      const validMin = await harness.studentClient.updateMyProfile({ batch_year: 1950 });
      expect(validMin.status).toBe(200);

      const validMax = await harness.studentClient.updateMyProfile({ batch_year: 2100 });
      expect(validMax.status).toBe(200);

      const invalidLow = await harness.studentClient.updateMyProfile({ batch_year: 1949 });
      expect(invalidLow.status).toBe(400);
      expect(invalidLow.data.error?.code).toBe('invalid_batch_year');

      const invalidHigh = await harness.studentClient.updateMyProfile({ batch_year: 2101 });
      expect(invalidHigh.status).toBe(400);
      expect(invalidHigh.data.error?.code).toBe('invalid_batch_year');
    });

    it('search query containing SQL meta-characters and script tags is safely handled', async () => {
      await harness.studentClient.updateMyProfile({
        full_name: 'Aditya Pratama',
        major: 'Informatika',
        skills: ['Cybersecurity', 'Web'],
      });

      const res = await harness.studentClient.listProfiles({
        search: "' OR 1=1; -- <script>alert(1)</script>",
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.profiles)).toBe(true);
    });
  });

  // ==========================================
  // Boundary 4: Status Transition & State Integrity
  // ==========================================
  describe('Boundary 4: Status Transition & State Integrity', () => {
    it('disallows backward transition from Done to Saved', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const trackRes = await harness.studentClient.trackOpportunity(opp.data.opportunity!.id);
      const trackId = trackRes.data.tracked!.id;

      // Saved -> Done
      await harness.studentClient.updateTrackedStatus(trackId, 'Done');

      // Attempt Done -> Saved
      const backRes = await harness.studentClient.updateTrackedStatus(trackId, 'Saved');
      expect(backRes.status).toBe(400);
      expect(backRes.data.error?.code).toBe('invalid_transition');
    });

    it('rejects unrecognized status string with invalid_status code', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const trackRes = await harness.studentClient.trackOpportunity(opp.data.opportunity!.id);
      const trackId = trackRes.data.tracked!.id;

      const badStatusRes = await harness.studentClient.updateTrackedStatus(trackId, 'UnderReview');
      expect(badStatusRes.status).toBe(400);
      expect(badStatusRes.data.error?.code).toBe('invalid_status');
    });

    it('prevents student from tracking the same opportunity twice', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const oppId = opp.data.opportunity!.id;

      const firstTrack = await harness.studentClient.trackOpportunity(oppId);
      expect(firstTrack.status).toBe(201);

      const duplicateTrack = await harness.studentClient.trackOpportunity(oppId);
      expect(duplicateTrack.status).toBe(409);
      expect(duplicateTrack.data.error?.code).toBe('already_tracked');
    });

    it('returns 404 when tracking non-existent opportunity', async () => {
      const trackRes = await harness.studentClient.trackOpportunity(999999);
      expect(trackRes.status).toBe(404);
      expect(trackRes.data.error?.code).toBe('not_found');
    });

    it('prevents student from modifying another student tracked opportunity', async () => {
      const opp = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const trackRes = await harness.studentClient.trackOpportunity(opp.data.opportunity!.id);
      const trackId = trackRes.data.tracked!.id;

      // Student B attempts to update Student A's item
      const unauthorizedUpdate = await harness.studentClientB.updateTrackedStatus(trackId, 'Applied');
      expect(unauthorizedUpdate.status).toBe(403);
      expect(unauthorizedUpdate.data.error?.code).toBe('forbidden');

      // Student B attempts to delete Student A's item
      const unauthorizedDelete = await harness.studentClientB.deleteTracked(trackId);
      expect(unauthorizedDelete.status).toBe(403);
    });

    it('enforces admin-only access control for creating, updating, and deleting opportunities', async () => {
      const studentCreate = await harness.studentClient.createOpportunity({
        title: 'Lomba Palsu dari Siswa',
        category: 'competition',
        deadline: inDays(10),
      });
      expect(studentCreate.status).toBe(403);

      const adminCreated = await harness.adminClient.createOpportunity(getSampleCompetition(0));
      const oppId = adminCreated.data.opportunity!.id;

      const studentUpdate = await harness.studentClient.updateOpportunity(oppId, { title: 'Ubah Judul' });
      expect(studentUpdate.status).toBe(403);

      const studentDelete = await harness.studentClient.deleteOpportunity(oppId);
      expect(studentDelete.status).toBe(403);
    });
  });
});
