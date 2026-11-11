export interface CardCounts {
  total: number;
  due: number;
  new: number;
  learning: number;
  mature: number;
}

export interface DueCard {
  id: number;
  front: string;
  back: string;
  reps: number;
  interval: number;
  doc_title: string;
}

export interface CardsDueResponse {
  cards: DueCard[];
  counts: CardCounts;
}

export interface CardsStatsResponse {
  counts: CardCounts;
  documents: { id: number; title: string; n: number; due: number }[];
}

export interface HubDocument {
  id: number;
  title: string;
}

/** SM-2 grades sent to `cards_review`: Lagi=1 (re-queued), Sulit=3, Baik=4, Mudah=5. */
export const GRADES = [
  { grade: 1, label: 'Lagi', hint: 'Belum ingat', tone: 'again' },
  { grade: 3, label: 'Sulit', hint: 'Ingat dengan susah payah', tone: 'hard' },
  { grade: 4, label: 'Baik', hint: 'Ingat', tone: 'good' },
  { grade: 5, label: 'Mudah', hint: 'Sangat mudah', tone: 'easy' },
] as const;
