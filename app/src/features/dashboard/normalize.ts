import { currentLocale } from '../../services/i18n';
import type { DashboardResponse, HeatmapPoint, WeeklyData } from './types';

/** One bar of the "this week" chart. */
export interface DayBar {
  key: string;
  label: string;
  seconds: number;
  isToday: boolean;
}

/**
 * What the home page shows, derived from the server's `dashboard` answer.
 *
 * The server's real shape is `streak.today`, `heatmap[{day,seconds,level}]`, `weekly{seconds,goal_min}`
 * and `overall{attempts,accuracy,...}`. Older and test payloads use other spellings, so this accepts
 * both. A value that is genuinely absent stays `null`: the page then shows a dash instead of a number
 * borrowed from somewhere else (for example lifetime study time presented as "today").
 */
export interface DashboardModel {
  streakCount: number;
  freezes: number;
  todayDone: boolean;
  atRisk: boolean;
  todaySeconds: number | null;
  goalSeconds: number | null;
  weekSeconds: number;
  weekGoalSeconds: number | null;
  accuracy: number | null;
  attempts: number;
  documents: number;
  studySeconds: number;
  days: DayBar[];
}

export function pointSeconds(pt: { seconds?: number; minutes?: number }): number {
  return pt.seconds ?? (pt.minutes ? pt.minutes * 60 : 0);
}

/** Short Indonesian weekday ("Sen", "Sel", ...) for an ISO day, or the raw text when it is not a date. */
export function weekdayLabel(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(currentLocale(), { weekday: 'short' }).replace('.', '');
}

function weeklyTotals(weekly: DashboardResponse['weekly'] | undefined): { seconds: number; goalSeconds: number | null } {
  if (Array.isArray(weekly)) {
    const seconds = weekly.reduce((sum, w: WeeklyData) => sum + pointSeconds(w), 0);
    const target = weekly.reduce((sum, w: WeeklyData) => sum + (w.target_minutes ?? 0), 0);
    return { seconds, goalSeconds: target > 0 ? target * 60 : null };
  }
  if (weekly && typeof weekly === 'object') {
    const goal = weekly.goal_min ?? weekly.target_minutes;
    return { seconds: pointSeconds(weekly), goalSeconds: goal ? goal * 60 : null };
  }
  return { seconds: 0, goalSeconds: null };
}

export function buildDashboardModel(data: DashboardResponse): DashboardModel {
  const streak = data.streak ?? {};
  const overall = data.overall ?? {};
  const heatmap: HeatmapPoint[] = data.heatmap ?? [];

  const week = weeklyTotals(data.weekly);
  const accuracy = overall.accuracy ?? overall.average_accuracy ?? null;
  const todayInfo = streak.today;
  const lastIndex = Math.min(heatmap.length, 7) - 1;

  return {
    streakCount: streak.count ?? streak.current ?? streak.current_streak ?? 0,
    freezes: streak.freezes ?? streak.freezes_available ?? 0,
    todayDone: Boolean(streak.today_done ?? todayInfo?.done),
    atRisk: Boolean(streak.at_risk),
    todaySeconds: typeof todayInfo?.seconds === 'number' ? todayInfo.seconds : null,
    goalSeconds: typeof todayInfo?.goal_seconds === 'number' ? todayInfo.goal_seconds : null,
    weekSeconds: week.seconds,
    weekGoalSeconds: week.goalSeconds,
    accuracy: accuracy != null && accuracy > 0 ? accuracy : null,
    attempts: overall.attempts ?? overall.total_quizzes_taken ?? 0,
    documents: overall.documents ?? data.recent_docs?.length ?? 0,
    studySeconds: overall.study_seconds ?? (overall.total_study_minutes ? overall.total_study_minutes * 60 : 0),
    days: heatmap.slice(-7).map((pt, i) => {
      const key = pt.day ?? pt.date ?? String(i);
      return { key, label: weekdayLabel(key), seconds: pointSeconds(pt), isToday: i === lastIndex };
    }),
  };
}

/** 0..1 progress toward a goal; 0 when there is no usable goal. */
export function ratio(value: number | null, goal: number | null): number {
  if (value == null || goal == null || goal <= 0) return 0;
  return Math.min(1, Math.max(0, value / goal));
}
