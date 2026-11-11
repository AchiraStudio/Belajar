export interface SubjectItem {
  id: number;
  name: string;
  color?: string;
  doc_count?: number;
}

export interface MaterialDoc {
  id: number;
  subject_id?: number | null;
  title: string;
  filename?: string;
  size?: number;
  status: 'ready' | 'processing' | 'queued' | 'error';
  error?: string;
  warning?: string;
  page_count?: number;
  style?: string;
  created_at?: string;
  updated_at?: string;
  subject_name?: string | null;
  subject_color?: string | null;
  quiz_count?: number;
  job_id?: number;
  job_progress?: number;
  job_message?: string;
  summary?: string | null;
}

export interface ListSubjectsResponse {
  subjects: SubjectItem[];
}

export interface ListDocumentsResponse {
  documents: MaterialDoc[];
}

export interface UploadResponse {
  ok?: boolean;
  data?: {
    doc_id?: number;
    id?: number;
    job_id?: number;
  };
  doc_id?: number;
  id?: number;
  job_id?: number;
}

export type ViewMode = 'grid' | 'list';
export type SortMode = 'new' | 'az' | 'quiz';

export const SUBJ_COLORS = [
  '#4B3FE8',
  '#D63E6A',
  '#0C8F5B',
  '#C77700',
  '#0A83B0',
  '#A33FC7',
  '#C2432B',
  '#3F6F14',
];

export interface NoteStyleOption {
  id: string;
  label: string;
  desc: string;
  group: 'Umum' | 'Detail';
}

export const NOTE_STYLES: NoteStyleOption[] = [
  { id: 'ringkas', label: 'Ringkas & Poin Penting', desc: 'Fokus pada inti bahasan, definisi kunci, dan kesimpulan singkat.', group: 'Umum' },
  { id: 'cornell', label: 'Metode Cornell', desc: 'Format klasik dengan kolom kata kunci, rangkuman utama, dan intisari evaluasi.', group: 'Umum' },
  { id: 'sederhana', label: 'Bahasa Sederhana', desc: 'Penjelasan santai dan analogi sehari-hari yang mudah dipahami pemula.', group: 'Umum' },
  { id: 'detail', label: 'Komprehensif & Mendalam', desc: 'Penjelasan menyeluruh mencakup rumus, konteks teoritis, dan contoh aplikasi.', group: 'Detail' },
  { id: 'sentence', label: 'Metode Kalimat Terstruktur', desc: 'Setiap poin penting dirumuskan dalam satu kalimat padat bernomor urut.', group: 'Detail' },
  { id: 'charting', label: 'Format Tabel & Matriks', desc: 'Penyajian kategori, perbandingan kelebihan/kekurangan, dan parameter analitis.', group: 'Detail' },
  { id: 'outline', label: 'Kerangka Hierarkis Bertingkat', desc: 'Struktur logis berjenjang dari bab besar, sub-bab, hingga poin detail mikro.', group: 'Detail' },
  { id: 'worked', label: 'Studi Kasus & Pembahasan Soal', desc: 'Fokus pada langkah demi langkah penyelesaian masalah dan contoh konkret.', group: 'Detail' },
];
