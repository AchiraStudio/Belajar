import type { CardCounts } from '../flashcards/types';
import type { Achievement, HubProfile } from '../progress/types';

export type GameKey = 'ajari' | 'detektif' | 'petualangan' | 'kasus' | 'kilat' | 'boss';

export interface GameMode {
  key: GameKey | string;
  title: string;
  desc: string;
  kind: string;
  hints: boolean;
  turns: { default: number; min: number; max: number };
}

export interface ActiveRun {
  id: number;
  game: string;
  title: string;
  scope_title?: string;
  turn_count: number;
  max_turns: number;
  correct: number;
  total: number;
  xp: number;
}

export interface HubDoc {
  id: number;
  title: string;
  subject_id?: number | null;
  subject?: string | null;
  concepts: number;
}

export interface GameHub {
  profile: HubProfile;
  streak: { current: number; longest: number };
  quests: { key: string; title: string; xp: number; done: boolean }[];
  modes: GameMode[];
  documents: HubDoc[];
  subjects: { id: number; name: string }[];
  levels: { baru: number; dikenal: number; paham: number; kuasai: number };
  weak: { id: number; term: string; doc_title: string; score: number }[];
  cards: CardCounts;
  active: ActiveRun | null;
  achievements: Achievement[];
}

export interface ConceptRow {
  id: number;
  document_id: number;
  term: string;
  definition: string;
  topic?: string | null;
  doc_title: string;
  score: number;
  evidence_n: number;
  kinds: string[];
}

export type ScopeSel = 'all' | `d:${number}` | `s:${number}`;

export function parseScope(sel: string): { scope_kind: 'all' | 'document' | 'subject'; scope_id: number } {
  const [kind, id] = sel.split(':');
  if (kind === 'd') return { scope_kind: 'document', scope_id: Number(id) };
  if (kind === 's') return { scope_kind: 'subject', scope_id: Number(id) };
  return { scope_kind: 'all', scope_id: 0 };
}
