import { cleanup, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlashcardsView } from '../../features/flashcards';
import { GamesHub } from '../../features/games';
import { MaterialsView } from '../../features/materials';
import { HelpView, AssistantView, CommunityView, MessagesView, NotificationsView } from '../../features/platform';
import { ProfileView } from '../../features/profile';
import { ProgressView } from '../../features/progress';
import { QuizzesView, WeakQuestionsView } from '../../features/quizzes';
import { SettingsView } from '../../features/settings';
import { mockRpc, renderWithProviders } from '../../test/e2e/harness';
import { I18nProvider } from './I18nContext';
import { setCurrentLanguage } from './translate';

// Realistic data for the two pages that only show their real layout once they have some.
const PROGRESS = {
  overall: { attempts: 3, answers: 12, accuracy: 70, study_seconds: 5400, documents: 2, quizzes: 3, questions: 30 },
  streak: { current: 2, longest: 4, freezes: 1, at_risk: false, today: { day: '2026-01-02', seconds: 600, quizzes: 1, goal_seconds: 600, done: true } },
  weekly: { start: '2025-12-29', seconds: 1800, quizzes: 2, goal_min: 120 },
  trend: [{ id: 1, ts: 1767225600, score: 7, total: 10, mode: 'practice', title: 'Sample' }],
  topics: [{ topic: 'A', n: 5, ok: 2, acc: 40, level: 'weak' }, { topic: 'B', n: 5, ok: 5, acc: 100, level: 'strong' }],
  documents: [{ id: 1, title: 'Doc', n: 5, acc: 80 }],
  study_days: [{ day: '2026-01-01', seconds: 600, quizzes: 1 }],
  weak_count: 3,
  settings: {},
};
const HUB = {
  profile: { level: 2, xp: 120, level_start: 100, next: 200 },
  streak: { current: 2, longest: 4 },
  quests: [{ key: 'q1', title: 'Quest', xp: 10, done: false }],
  modes: [{ key: 'kilat', title: 'Kilat', desc: 'x', turns: { default: 5 }, hints: true }],
  documents: [{ id: 1, title: 'Doc' }],
  subjects: [{ id: 1, name: 'Subj' }],
  levels: { baru: 1, dikenal: 1, paham: 1, kuasai: 1 },
  weak: [{ id: 1, term: 'T', doc_title: 'Doc', score: 20 }],
  cards: { total: 5, due: 2, new: 1, learning: 1, mature: 1 },
  active: null,
  achievements: [{ key: 'a', title: 'Badge', desc: 'd', unlocked: true, at: 1 }],
};

/**
 * A page that follows the language setting shows no leftover Indonesian when the language is
 * English. This renders real pages (static and with empty/loading data, so no server-provided
 * text is involved) and looks for common Indonesian words.
 */
const INDONESIAN = /\b(yang|untuk|belum|tidak|kamu|materi|soal|kuis|jawaban|sudah|atau|dengan|pada|silakan|memuat|gagal|simpan|hapus|selesai)\b/i;

const PAGES: [string, () => React.ReactElement][] = [
  ['Help', () => <HelpView />],
  ['Community', () => <CommunityView />],
  ['Messages', () => <MessagesView />],
  ['Notifications', () => <NotificationsView />],
  ['Assistant', () => <AssistantView />],
  ['Materials', () => <MaterialsView />],
  ['Quizzes', () => <QuizzesView />],
  ['Weak questions', () => <WeakQuestionsView />],
  ['Flashcards', () => <FlashcardsView />],
  ['Progress', () => <ProgressView />],
  ['Games', () => <GamesHub />],
  ['Profile', () => <ProfileView />],
  ['Settings', () => <SettingsView />],
];

describe('pages follow the language setting', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('progress', PROGRESS);
    mockRpc.setResponse('play_hub', HUB);
    mockRpc.setResponse('cards_due', { cards: [{ id: 1, front: 'F', back: 'B', reps: 0, interval: 0, doc_title: 'Doc' }], counts: HUB.cards, documents: [{ id: 1, title: 'Doc', n: 5, due: 2 }], session_limit: 20 });
    mockRpc.setResponse('cards_stats', { ...HUB.cards, documents: [{ id: 1, title: 'Doc', n: 5, due: 2 }] });
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    setCurrentLanguage('id');
  });

  for (const [name, page] of PAGES) {
    it(`${name} shows no Indonesian in English`, async () => {
      renderWithProviders(<I18nProvider initial="en">{page()}</I18nProvider>);
      // Let the first render (and any loading → empty/error transition) settle.
      await waitFor(() => expect(document.body.textContent?.length ?? 0).toBeGreaterThan(20));
      await new Promise((r) => setTimeout(r, 60));
      // Server-made text (a mock error, fixture data) is not the app's to translate.
      const text = (document.body.textContent ?? '').replace(/\s+/g, ' ').replace(/Endpoint \S+ tidak ditemukan pada mock server/g, '');
      const hit = INDONESIAN.exec(text);
      expect(hit ? text.slice(Math.max(0, hit.index - 50), hit.index + 60) : null).toBeNull();
    });
  }

  it('the same pages stay Indonesian when the language is Indonesian', async () => {
    renderWithProviders(<I18nProvider initial="id"><HelpView /></I18nProvider>);
    expect(await screen.findByText('Pertanyaan umum')).toBeTruthy();
  });
});
