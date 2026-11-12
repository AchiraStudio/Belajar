import { describe, expect, it } from 'vitest';
import { buildDashboardModel, pointSeconds, ratio, weekdayLabel } from './normalize';
import type { DashboardResponse } from './types';

const base: DashboardResponse = {
  streak: {},
  heatmap: [],
  weekly: [],
  overall: {},
  recent_docs: [],
  recent_attempts: [],
  weak_topics: [],
  weak_count: 0,
};

describe('buildDashboardModel', () => {
  it('reads the real server shape (streak.today, weekly object, overall.accuracy)', () => {
    const m = buildDashboardModel({
      ...base,
      streak: { current: 9, freezes: 1, at_risk: true, today: { day: '2026-11-10', seconds: 420, goal_seconds: 600, quizzes: 0, done: false } },
      weekly: { start: '2026-11-09', seconds: 3000, quizzes: 2, goal_min: 120 },
      overall: { attempts: 12, accuracy: 76.4, study_seconds: 90000, documents: 5 },
    });
    expect(m).toMatchObject({
      streakCount: 9,
      freezes: 1,
      atRisk: true,
      todayDone: false,
      todaySeconds: 420,
      goalSeconds: 600,
      weekSeconds: 3000,
      weekGoalSeconds: 7200,
      accuracy: 76.4,
      attempts: 12,
      documents: 5,
      studySeconds: 90000,
    });
  });

  it('leaves today unknown (null) instead of borrowing lifetime study time', () => {
    const m = buildDashboardModel({ ...base, overall: { total_study_minutes: 290 } });
    expect(m.todaySeconds).toBeNull();
    expect(m.goalSeconds).toBeNull();
    // Lifetime study time is still available, under its own name.
    expect(m.studySeconds).toBe(290 * 60);
  });

  it('accepts the older spelling (count, today_done, weekly array, minutes)', () => {
    const m = buildDashboardModel({
      ...base,
      streak: { count: 7, today_done: true },
      weekly: [
        { day: 'Sen', minutes: 40, target_minutes: 30 },
        { day: 'Sel', minutes: 20, target_minutes: 30 },
      ],
      overall: { total_quizzes_taken: 8, average_accuracy: 84.5 },
    });
    expect(m.streakCount).toBe(7);
    expect(m.todayDone).toBe(true);
    expect(m.weekSeconds).toBe(3600);
    expect(m.weekGoalSeconds).toBe(3600);
    expect(m.attempts).toBe(8);
    expect(m.accuracy).toBe(84.5);
  });

  it('treats an accuracy of 0 or null as "no score yet", not as 0%', () => {
    expect(buildDashboardModel({ ...base, overall: { accuracy: 0 } }).accuracy).toBeNull();
    expect(buildDashboardModel({ ...base, overall: {} }).accuracy).toBeNull();
  });

  it('keeps only the last seven days and marks the final one as today', () => {
    const heatmap = Array.from({ length: 10 }, (_, i) => ({ day: `2026-11-0${i}`, seconds: i * 60, level: 1 }));
    const m = buildDashboardModel({ ...base, heatmap });
    expect(m.days).toHaveLength(7);
    expect(m.days.map((d) => d.seconds)).toEqual([180, 240, 300, 360, 420, 480, 540]);
    expect(m.days.filter((d) => d.isToday).map((d) => d.seconds)).toEqual([540]);
  });

  it('falls back to the document count when overall.documents is absent', () => {
    const doc = { id: 1, title: 'A', status: 'ready' as const };
    expect(buildDashboardModel({ ...base, recent_docs: [doc, { ...doc, id: 2 }] }).documents).toBe(2);
  });
});

describe('helpers', () => {
  it('pointSeconds prefers seconds, then minutes', () => {
    expect(pointSeconds({ seconds: 90 })).toBe(90);
    expect(pointSeconds({ minutes: 2 })).toBe(120);
    expect(pointSeconds({})).toBe(0);
  });

  it('ratio is clamped to 0..1 and 0 without a usable goal', () => {
    expect(ratio(50, 100)).toBe(0.5);
    expect(ratio(500, 100)).toBe(1);
    expect(ratio(-5, 100)).toBe(0);
    expect(ratio(null, 100)).toBe(0);
    expect(ratio(10, null)).toBe(0);
    expect(ratio(10, 0)).toBe(0);
  });

  it('weekdayLabel gives a short Indonesian weekday and passes non-dates through', () => {
    expect(weekdayLabel('2026-11-09')).toMatch(/^Sen/); // a Monday
    expect(weekdayLabel('bukan tanggal')).toBe('bukan tanggal');
  });
});
