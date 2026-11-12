// Legacy Opportunity and Tracker fixtures preserved for existing test suite compatibility
import type {
  Opportunity,
  PeerProfile,
  HealthResponse,
  UploadResponse,
  Adr7ErrorResponse,
  DashboardResponse,
  ListSubjectsResponse,
  ListDocumentsResponse,
  GetDocumentResponse,
  NoteSummary,
  ListQuizzesResponse,
  PublicQuestion,
  StartAttemptResponse,
  StartReviewResponse,
  GetAttemptResponse,
  CheckAnswerResponse,
  FinishAttemptResponse,
  ExplainQuestionResponse,
  CardsDueResponse,
  CardsStatsResponse,
  CardsExportResponse,
  PlayHubResponse,
  PlayMapResponse,
  PlayTurnResponse,
  PlayGetResponse,
  PlayFinishResponse,
  ProgressResponse,
  GetSettingsResponse,
  LlmCheckResponse,
  JobDetailResponse,
  PingResponse,
} from './contracts';
import { E2EClient } from './client';
import { ContractSimulator } from './simulator';

export function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

export function inDays(days: number): number {
  return nowSecs() + days * 86400;
}

export function inHours(hours: number): number {
  return nowSecs() + hours * 3600;
}

export function agoDays(days: number): number {
  return nowSecs() - days * 86400;
}

export function createTestHarness(): {
  simulator: ContractSimulator;
  adminClient: E2EClient;
  studentClient: E2EClient;
  studentClientB: E2EClient;
} {
  const simulator = new ContractSimulator();
  const adminClient = new E2EClient({
    session: { userId: 'admin-uuid-001', role: 'admin' },
    simulator,
  });
  const studentClient = new E2EClient({
    session: { userId: 'student-uuid-alice', role: 'student' },
    simulator,
  });
  const studentClientB = new E2EClient({
    session: { userId: 'student-uuid-bob', role: 'student' },
    simulator,
  });

  return { simulator, adminClient, studentClient, studentClientB };
}

export const sampleCompetitions: Array<Partial<Opportunity>> = [
  {
    title: 'Gemastik XVII Bidang Pemrograman',
    description: 'Kompetisi pemrograman tahunan tingkat nasional untuk mahasiswa Indonesia.',
    category: 'competition',
    organizer: 'Puspresnas Kemdikbudristek',
    deadline: inDays(30),
    target_majors: ['Informatika', 'Sistem Informasi', 'Teknik Komputer'],
    guideline_text: 'Pedoman Teknis Gemastik XVII: Format tim terdiri dari 3 orang mahasiswa.',
    is_published: 1,
  },
  {
    title: 'Hackathon Nasional AI & Web3 2026',
    description: 'Bangun solusi AI generatif untuk menyelesaikan masalah riil di Indonesia.',
    category: 'competition',
    organizer: 'Tech Innovators Indonesia',
    deadline: inDays(14),
    target_majors: ['Informatika', 'Data Science'],
    guideline_text: 'Ketentuan Proyek: Repositori Git publik dengan demo live.',
    is_published: 1,
  },
  {
    title: 'Kompetisi Debat Bahasa Inggris Mahasiswa',
    description: 'Kompetisi debat parlemen terbuka untuk seluruh rumpun humaniora dan teknik.',
    category: 'competition',
    organizer: 'Badan Eksekutif Mahasiswa',
    deadline: inDays(7),
    target_majors: [], // Open to all
    guideline_text: 'Pedoman Debat: Menggunakan British Parliamentary System.',
    is_published: 1,
  },
];

export const sampleScholarships: Array<Partial<Opportunity>> = [
  {
    title: 'Beasiswa Unggulan Mahasiswa Berprestasi 2026',
    description: 'Bantuan biaya kuliah penuh dan uang saku bulanan bagi mahasiswa berprestasi.',
    category: 'scholarship',
    organizer: 'Kementerian Pendidikan',
    deadline: inDays(45),
    target_majors: ['Informatika', 'Hukum', 'Kedokteran', 'Manajemen'],
    guideline_text: 'Buku Panduan Beasiswa: Wajib melampirkan esai dan sertifikat prestasi.',
    is_published: 1,
  },
  {
    title: 'Djarum Beasiswa Plus Angkatan 42',
    description: 'Program pelatihan kepemimpinan soft skills dan dana beasiswa 1 tahun.',
    category: 'scholarship',
    organizer: 'Djarum Foundation',
    deadline: inDays(20),
    target_majors: [], // All majors
    guideline_text: 'Syarat IPK minimal 3.20 pada semester IV.',
    is_published: 1,
  },
];

export const sampleProfiles: Array<Partial<PeerProfile>> = [
  {
    full_name: 'Budi Santoso',
    major: 'Informatika',
    batch_year: 2024,
    bio: 'Pengembang Frontend React dan UI designer antusias kompetisi hackathon.',
    academic_interests: ['Web Development', 'Human Computer Interaction'],
    skills: ['React', 'TypeScript', 'Tailwind', 'Figma'],
    contact_info: { email: 'budi@kampus.ac.id', telegram: '@budisantoso' },
    is_looking_for_team: 1,
  },
  {
    full_name: 'Siti Rahma',
    major: 'Informatika',
    batch_year: 2023,
    bio: 'Backend & Systems engineer tertarik dengan Rust dan arsitektur microservices.',
    academic_interests: ['Systems Programming', 'Distributed Systems'],
    skills: ['Rust', 'PostgreSQL', 'Docker', 'Axum'],
    contact_info: { email: 'siti@kampus.ac.id', telegram: '@sitir' },
    is_looking_for_team: 1,
  },
  {
    full_name: 'Dewi Lestari',
    major: 'Sistem Informasi',
    batch_year: 2024,
    bio: 'Product Manager dan UX Researcher berpengalaman menyusun pitch deck dan dokumentasi proposal.',
    academic_interests: ['Product Management', 'Data Analytics'],
    skills: ['Product Planning', 'UI/UX Research', 'Python', 'Business Analysis'],
    contact_info: { email: 'dewi@kampus.ac.id', telegram: '@dewil' },
    is_looking_for_team: 1,
  },
];

export function getSampleCompetition(index: number): Partial<Opportunity> {
  const item = sampleCompetitions[index];
  if (!item) throw new Error(`Missing sample competition at index ${index}`);
  return item;
}

export function getSampleScholarship(index: number): Partial<Opportunity> {
  const item = sampleScholarships[index];
  if (!item) throw new Error(`Missing sample scholarship at index ${index}`);
  return item;
}

export function getSampleProfile(index: number): Partial<PeerProfile> {
  const item = sampleProfiles[index];
  if (!item) throw new Error(`Missing sample profile at index ${index}`);
  return item;
}

// ============================================================================
// Stuby Frost UI Realistic Fixtures
// ============================================================================

export const defaultHealthFixture: HealthResponse = {
  status: 'ok',
  service: 'stuby-server',
  version: '0.1.0',
};

export const defaultUploadFixture: UploadResponse = {
  id: 104,
  title: 'Struktur Data & Algoritma.pdf',
  filename: 'struktur_data.pdf',
  subject_id: 1,
  status: 'processing',
  job_id: 802,
};

export const defaultErrorFixture: Adr7ErrorResponse = {
  error: {
    code: 'internal_error',
    message: 'Terjadi kesalahan internal pada server.',
    retryable: true,
  },
};

export const defaultSubjectsFixture: ListSubjectsResponse = {
  subjects: [
    { id: 1, name: 'Ilmu Komputer', color: '#6558E8', doc_count: 5 },
    { id: 2, name: 'Fisika Dasar', color: '#218B68', doc_count: 3 },
    { id: 3, name: 'Matematika Terapan', color: '#B7792E', doc_count: 2 },
  ],
};

export const defaultDocumentsFixture: ListDocumentsResponse = {
  documents: [
    {
      id: 101,
      title: 'Pengantar Jaringan Komputer & OSI Layer',
      filename: 'jaringan_komputer.pdf',
      subject_id: 1,
      subject_name: 'Ilmu Komputer',
      status: 'ready',
      created_at: '2026-11-01T10:00:00Z',
      page_count: 24,
      summary: 'Dasar-dasar arsitektur jaringan komputer, protokol TCP/IP, dan 7 lapisan model OSI.',
    },
    {
      id: 102,
      title: 'Termodinamika & Siklus Carnot',
      filename: 'termodinamika.pdf',
      subject_id: 2,
      subject_name: 'Fisika Dasar',
      status: 'ready',
      created_at: '2026-11-03T14:30:00Z',
      page_count: 18,
      summary: 'Hukum I dan II Termodinamika, konsep entropi, dan efisiensi mesin Carnot.',
    },
    {
      id: 103,
      title: 'Aljabar Linear: Matriks & Vektor Eigen',
      filename: 'aljabar_linear.pdf',
      subject_id: 3,
      subject_name: 'Matematika Terapan',
      status: 'processing',
      created_at: '2026-11-09T08:15:00Z',
      page_count: 32,
      summary: 'Dekomposisi matriks, transformasi linear, dan aplikasi nilai eigen dalam data science.',
    },
  ],
};

export const defaultNotesContent = `# Teorema Pythagoras & Trigonometri Dasar

## 1. Rumus Utama

Dalam segitiga siku-siku dengan sisi $a$, $b$, dan hipotenusa $c$:

$$a^2 + b^2 = c^2$$

Rumus identitas trigonometri:

$$\\sin^2(\\theta) + \\cos^2(\\theta) = 1$$

## 2. Implementasi Python

\`\`\`python
import math

def hitung_hipotenusa(a: float, b: float) -> float:
    """Menghitung panjang hipotenusa segitiga siku-siku."""
    return math.sqrt(a**2 + b**2)
\`\`\`

## 3. Catatan Penting
- Teorema hanya berlaku pada segitiga siku-siku ($90^\\circ$).
- Pastikan satuan panjang sama sebelum menghitung.
`;

export const defaultNotesFixture: NoteSummary = {
  id: 201,
  document_id: 101,
  content_md: defaultNotesContent,
  updated_at: '2026-11-02T11:20:00Z',
};

export const defaultDocumentDetailFixture: GetDocumentResponse = {
  document: {
    id: 101,
    title: 'Pengantar Jaringan Komputer & OSI Layer',
    filename: 'jaringan_komputer.pdf',
    subject_id: 1,
    subject_name: 'Ilmu Komputer',
    status: 'ready',
    created_at: '2026-11-01T10:00:00Z',
    page_count: 24,
    file_size: 2450000,
    summary: 'Dasar-dasar arsitektur jaringan komputer, protokol TCP/IP, dan 7 lapisan model OSI.',
    content: defaultNotesContent,
  },
  subject: { id: 1, name: 'Ilmu Komputer', color: '#6558E8' },
  note: defaultNotesFixture,
  quizzes: [
    { id: 301, title: 'Kuis Diagnostik Jaringan', question_count: 5, difficulty: 'medium', created_at: '2026-11-02T12:00:00Z' },
  ],
  job: null,
};

export const defaultDashboardFixture: DashboardResponse = {
  streak: {
    count: 7,
    last_activity_date: '2026-11-10',
    today_done: true,
  },
  heatmap: [
    { date: '2026-10-28', minutes: 35, intensity: 2 },
    { date: '2026-10-29', minutes: 50, intensity: 3 },
    { date: '2026-10-30', minutes: 20, intensity: 1 },
    { date: '2026-10-31', minutes: 65, intensity: 4 },
    { date: '2026-11-01', minutes: 40, intensity: 2 },
    { date: '2026-11-02', minutes: 45, intensity: 3 },
    { date: '2026-11-03', minutes: 30, intensity: 2 },
  ],
  weekly: [
    { day: 'Sen', minutes: 40, target_minutes: 30 },
    { day: 'Sel', minutes: 45, target_minutes: 30 },
    { day: 'Rab', minutes: 30, target_minutes: 30 },
    { day: 'Kam', minutes: 55, target_minutes: 30 },
    { day: 'Jum', minutes: 35, target_minutes: 30 },
    { day: 'Sab', minutes: 60, target_minutes: 30 },
    { day: 'Min', minutes: 25, target_minutes: 30 },
  ],
  overall: {
    total_study_minutes: 290,
    total_quizzes_taken: 8,
    average_accuracy: 84.5,
    streak_days: 7,
  },
  recent_docs: defaultDocumentsFixture.documents,
  recent_attempts: [
    {
      attempt_id: 501,
      quiz_id: 301,
      quiz_title: 'Kuis Diagnostik Jaringan',
      score: 4,
      total: 5,
      percentage: 80,
      date: '2026-11-09T16:00:00Z',
    },
  ],
  weak_topics: [
    {
      topic: 'Transport Layer Protocols',
      subject: 'Ilmu Komputer',
      accuracy: 40,
      weak_question_count: 3,
    },
    {
      topic: 'Entropi dan Siklus Carnot',
      subject: 'Fisika Dasar',
      accuracy: 50,
      weak_question_count: 2,
    },
  ],
  weak_count: 5,
};

export const emptyDashboardFixture: DashboardResponse = {
  streak: { count: 0, last_activity_date: '', today_done: false },
  heatmap: [],
  weekly: [],
  overall: { total_study_minutes: 0, total_quizzes_taken: 0, average_accuracy: 0, streak_days: 0 },
  recent_docs: [],
  recent_attempts: [],
  weak_topics: [],
  weak_count: 0,
};

export const defaultQuizzesFixture: ListQuizzesResponse = {
  quizzes: [
    {
      id: 301,
      title: 'Kuis Diagnostik Jaringan',
      document_id: 101,
      document_title: 'Pengantar Jaringan Komputer & OSI Layer',
      question_count: 5,
      difficulty: 'medium',
      created_at: '2026-11-02T12:00:00Z',
      attempts_count: 2,
      last_score: 80,
    },
    {
      id: 302,
      title: 'Ujian Evaluasi Termodinamika',
      document_id: 102,
      document_title: 'Termodinamika & Siklus Carnot',
      question_count: 10,
      difficulty: 'hard',
      created_at: '2026-11-04T15:00:00Z',
      attempts_count: 1,
      last_score: 70,
    },
  ],
};

export const defaultQuestionsFixture: PublicQuestion[] = [
  {
    id: 1,
    quiz_id: 301,
    type: 'mcq',
    prompt: 'Lapisan OSI manakah yang bertanggung jawab untuk routing paket data lintas jaringan?',
    options: ['Data Link Layer', 'Network Layer', 'Transport Layer', 'Session Layer'],
    explanation: 'Network Layer (Lapisan 3) mengelola pengalamatan logis (IP) dan routing antar jaringan.',
    topic: 'OSI Layer',
  },
  {
    id: 2,
    quiz_id: 301,
    type: 'tf',
    prompt: 'Protokol UDP menjamin urutan dan kepastian sampainya paket data ke tujuan.',
    options: ['Benar', 'Salah'],
    explanation: 'Salah. UDP adalah protokol connectionless yang tidak menjamin urutan atau keandalan pengiriman.',
    topic: 'Transport Layer',
  },
  {
    id: 3,
    quiz_id: 301,
    type: 'short',
    prompt: 'Tuliskan persamaan rumus daya listrik dalam hubungan tegangan (V) dan arus (I)!',
    explanation: 'Rumus daya listrik adalah P = V * I.',
    topic: 'Listrik & Daya',
  },
  {
    id: 4,
    quiz_id: 301,
    type: 'mcq',
    prompt: 'Pada siklus Carnot, efisiensi termal maksimum ditentukan oleh formula:',
    options: ['1 - (T_c / T_h)', '1 - (T_h / T_c)', 'T_c / T_h', '(T_h - T_c) / T_c'],
    explanation: 'Efisiensi mesin Carnot ideal adalah eta = 1 - (T_c / T_h) dengan temperatur dalam Kelvin.',
    topic: 'Termodinamika',
  },
  {
    id: 5,
    quiz_id: 301,
    type: 'mcq',
    prompt: 'Port standar yang digunakan untuk sambungan web terenkripsi HTTPS adalah:',
    options: ['Port 80', 'Port 443', 'Port 8080', 'Port 22'],
    explanation: 'HTTPS secara standar beroperasi pada TCP port 443, sedangkan HTTP biasa pada port 80.',
    topic: 'Protokol Web',
  },
];

export const defaultPracticeAttemptFixture: StartAttemptResponse = {
  attempt: {
    id: 501,
    quiz_id: 301,
    mode: 'practice',
    started_at: '2026-11-10T12:00:00Z',
    time_limit: null,
    total: 5,
    questions: defaultQuestionsFixture,
  },
};

export const defaultExamAttemptFixture: StartAttemptResponse = {
  attempt: {
    id: 502,
    quiz_id: 301,
    mode: 'exam',
    started_at: '2026-11-10T12:00:00Z',
    time_limit: 900, // 15 mins (900 seconds)
    total: 5,
    questions: defaultQuestionsFixture,
  },
};

export const defaultReviewAttemptFixture: StartReviewResponse = {
  attempt: {
    id: 503,
    mode: 'review',
    total: 3,
    questions: defaultQuestionsFixture.slice(0, 3),
  },
};

export const defaultGetAttemptFixture: GetAttemptResponse = {
  attempt: {
    id: 501,
    quiz_id: 301,
    mode: 'practice',
    started_at: '2026-11-10T12:00:00Z',
    completed_at: null,
    time_limit: null,
    total: 5,
  },
  quiz: { id: 301, title: 'Kuis Diagnostik Jaringan', difficulty: 'medium' },
  questions: defaultQuestionsFixture,
  answers: { '1': 'Network Layer' },
  result: null,
};

export const defaultCheckAnswerFixture: CheckAnswerResponse = {
  correct: true,
  explanation: 'Lapisan Network (Lapisan 3) bertanggung jawab untuk pengalamatan logis (IP address) dan routing paket melalui internetwork.',
  correct_answer: 'Network Layer',
};

export const defaultFinishAttemptFixture: FinishAttemptResponse = {
  attempt_id: 501,
  score: 4,
  total: 5,
  percentage: 80,
  questions: defaultQuestionsFixture,
  answers: {
    '1': 'Network Layer',
    '2': 'Salah',
    '3': 'P = V * I',
    '4': '1 - (T_c / T_h)',
    '5': 'Port 80',
  },
  result: {
    score: 4,
    total: 5,
    percentage: 80,
    passed: true,
  },
};

export const defaultExplainQuestionFixture: ExplainQuestionResponse = {
  explanation: 'Penjelasan komprehensif: Model referensi OSI terdiri dari 7 lapis terstandarisasi. Lapisan Network berfungsi mengarahkan paket melalui hop perantara menggunakan routing protocol seperti OSPF, BGP, atau RIP.',
};

export const defaultCardsDueFixture: CardsDueResponse = {
  cards: [
    {
      id: 601,
      document_id: 101,
      front: 'Sebutkan 7 lapisan dalam model referensi OSI!',
      back: 'Physical, Data Link, Network, Transport, Session, Presentation, Application.',
      next_review: '2026-11-10T00:00:00Z',
      interval: 1,
      ease_factor: 2.5,
      repetitions: 1,
    },
    {
      id: 602,
      document_id: 101,
      front: 'Apa perbedaan utama TCP dan UDP?',
      back: 'TCP bersifat connection-oriented dan menjamin pengiriman paket; UDP connectionless dan memprioritaskan kecepatan tanpa garansi.',
      next_review: '2026-11-10T00:00:00Z',
      interval: 3,
      ease_factor: 2.4,
      repetitions: 2,
    },
  ],
  count: 2,
};

export const defaultCardsStatsFixture: CardsStatsResponse = {
  total: 35,
  due_today: 5,
  learned: 30,
  retention_rate: 91.5,
};

export const defaultCardsExportFixture: CardsExportResponse = {
  tsv: "Sebutkan 7 lapisan dalam model OSI!\tPhysical, Data Link, Network, Transport, Session, Presentation, Application\tJaringan\nApa perbedaan TCP dan UDP?\tTCP connection-oriented; UDP connectionless\tJaringan\n",
  filename: 'stuby_flashcards_export.tsv',
};

export const defaultPlayHubFixture: PlayHubResponse = {
  modes: [
    { id: 'ajari_aku', title: 'Ajari Aku', description: 'Jelaskan konsep ke AI murid yang penasaran', icon: 'graduation-cap', badge: 'Populer' },
    { id: 'detektif', title: 'Detektif Salah Kaprah', description: 'Temukan kekeliruan logika dalam argumen', icon: 'search' },
    { id: 'petualangan', title: 'Petualangan Konsep', description: 'RPG berbasis pilihan pengetahuan', icon: 'compass' },
    { id: 'kasus_nyata', title: 'Kasus Nyata', description: 'Pecahkan studi kasus industri nyata', icon: 'briefcase' },
    { id: 'kilat', title: 'Tantangan Kilat', description: 'Jawab cepat dalam batas waktu 60 detik', icon: 'zap' },
    { id: 'boss', title: 'Ujian Boss', description: 'Hadapi penguji AI dengan pertanyaan mendalam', icon: 'shield' },
  ],
  counts: { ajari_aku: 12, detektif: 8, petualangan: 5, kasus_nyata: 4, kilat: 20, boss: 3 },
  weak: [
    { id: 1, concept: 'Subnetting CIDR', mistake_count: 4 },
    { id: 2, concept: 'Siklus Carnot', mistake_count: 3 },
  ],
  due_count: 5,
  active_run: {
    run_id: 'run-game-101',
    mode_id: 'ajari_aku',
    mode_title: 'Ajari Aku',
    turn: 2,
    turns_total: 5,
    score: 15,
  },
  level: {
    level: 3,
    current_xp: 320,
    next_level_xp: 500,
    title: 'Penjelajah Konsep',
  },
  quests: [
    { id: 'q1', title: 'Selesaikan 1 kuis latihan', completed: true, reward_xp: 25 },
    { id: 'q2', title: 'Mainkan 1 giliran mode game', completed: false, reward_xp: 30 },
    { id: 'q3', title: 'Review 5 kartu flashcards', completed: false, reward_xp: 20 },
  ],
  achievements: [
    { id: 'ach1', title: 'Langkah Pertama', description: 'Menyelesaikan sesi belajar pertama', unlocked: true, icon: 'award' },
    { id: 'ach2', title: 'Penguasa Materi', description: 'Mencapai skor 100% pada kuis', unlocked: true, icon: 'star' },
  ],
};

export const defaultPlayMapFixture: PlayMapResponse = {
  concepts: [
    { id: 1, name: 'Model OSI 7 Layer', subject_id: 1, tier: 'kuasai', accuracy: 95 },
    { id: 2, name: 'TCP vs UDP', subject_id: 1, tier: 'paham', accuracy: 80 },
    { id: 3, name: 'Subnetting IPv4', subject_id: 1, tier: 'dikenal', accuracy: 60 },
    { id: 4, name: 'BGP Routing', subject_id: 1, tier: 'baru', accuracy: 30 },
  ],
  grid: {
    total: 4,
    tiers: { baru: 1, dikenal: 1, paham: 1, kuasai: 1 },
  },
};

export const defaultPlayTurnFixture: PlayTurnResponse = {
  text: 'Bagus sekali! Kamu menjelaskan konsep enkapsulasi dengan sangat jernih. Sekarang, bisakah kamu jelaskan apa peran header pada tiap layer?',
  turn: 3,
  score: 25,
  done: false,
  feedback: 'Penjelasan akurat dan mudah dipahami.',
};

export const defaultPlayGetFixture: PlayGetResponse = {
  run: {
    id: 'run-game-101',
    game: 'ajari_aku',
    status: 'active',
    score: 25,
    turn: 2,
    turns_total: 5,
    history: [
      { turn: 1, question: 'Apa itu model OSI?', answer: 'Model 7 layer jaringan.', score: 10 },
      { turn: 2, question: 'Mengapa butuh 7 layer?', answer: 'Untuk modularitas standar.', score: 15 },
    ],
  },
};

export const defaultPlayFinishFixture: PlayFinishResponse = {
  run_id: 'run-game-101',
  score: 45,
  xp_earned: 40,
  report: 'Kerja luar biasa! Pemahamanmu terhadap dasar-dasar jaringan komputer berada pada level mahir.',
};

export const defaultProgressFixture: ProgressResponse = {
  overall: {
    total_study_minutes: 420,
    total_quizzes_taken: 14,
    average_accuracy: 86.2,
    streak_days: 7,
  },
  streak: { count: 7, last_activity_date: '2026-11-10', today_done: true },
  weekly: [
    { week_start: '2026-10-26', total_minutes: 180, completed_quizzes: 6 },
    { week_start: '2026-11-02', total_minutes: 240, completed_quizzes: 8 },
  ],
  trend: [
    { date: '2026-11-01', score: 75 },
    { date: '2026-11-03', score: 80 },
    { date: '2026-11-06', score: 85 },
    { date: '2026-11-09', score: 90 },
  ],
  topics: [
    { topic: 'Model OSI', subject: 'Ilmu Komputer', mastery_percentage: 92, tier: 'kuasai' },
    { topic: 'Termodinamika', subject: 'Fisika Dasar', mastery_percentage: 78, tier: 'paham' },
    { topic: 'Subnetting IPv4', subject: 'Ilmu Komputer', mastery_percentage: 55, tier: 'dikenal' },
  ],
  documents: [
    { document_id: 101, title: 'Pengantar Jaringan Komputer', studied_minutes: 150, mastery_rate: 88 },
    { document_id: 102, title: 'Termodinamika & Siklus Carnot', studied_minutes: 90, mastery_rate: 75 },
  ],
  study_days: [1, 2, 3, 4, 5, 6, 7],
  weak_count: 3,
  settings: { daily_target: '30' },
};

export const defaultGetSettingsFixture: GetSettingsResponse = {
  settings: {
    daily_goal_minutes: '30',
    notes_style: 'cornell',
    language: 'id',
    theme: 'auto',
  },
  timezone: 'Asia/Jakarta',
};

export const defaultLlmCheckFixture: LlmCheckResponse = {
  ok: true,
  provider: 'gemini',
  model: 'gemini-1.5-flash',
  latency_ms: 210,
};

export const defaultGetJobFixture: JobDetailResponse = {
  id: 801,
  kind: 'document_processing',
  status: 'processing',
  progress: 65,
  message: 'Mengekstrak konsep kunci dan membuat ringkasan catatan...',
  error: null,
};

export const defaultPingFixture: PingResponse = {
  version: '0.1.0',
  time: Math.floor(Date.now() / 1000),
  llm_configured: true,
};

// ============================================================================
// Supplemental Fixtures for M2 Features (F12, F13, F14, F24)
// ============================================================================

export interface NotesAskResponse {
  answer: string;
  ask_session_id: number;
  mode: 'new' | 'continue';
}

export const defaultNotesAskFixture: NotesAskResponse = {
  answer: 'Dalam model OSI, Transport Layer bertugas memastikan transmisi data andal dari ujung ke ujung melalui TCP atau transmisi cepat tanpa koneksi melalui UDP.',
  ask_session_id: 12,
  mode: 'new',
};

export interface MindMapNode {
  id: string;
  label: string;
  parentId?: string;
  children?: MindMapNode[];
}

export interface MindMapResponse {
  nodes?: Array<{ id: string; label: string; parentId?: string }>;
  edges?: Array<{ id: string; source: string; target: string }>;
  mindmap?: {
    root: MindMapNode;
    node_count: number;
    stale: boolean;
  };
}

export const defaultMindMapFixture: MindMapResponse = {
  nodes: [
    { id: 'root', label: 'Jaringan Komputer' },
    { id: 'n1', label: 'Model OSI', parentId: 'root' },
    { id: 'n1_1', label: 'Network Layer', parentId: 'n1' },
    { id: 'n1_2', label: 'Transport Layer', parentId: 'n1' },
    { id: 'n2', label: 'Protokol TCP/IP', parentId: 'root' },
  ],
  edges: [
    { id: 'e1', source: 'root', target: 'n1' },
    { id: 'e2', source: 'n1', target: 'n1_1' },
    { id: 'e3', source: 'n1', target: 'n1_2' },
    { id: 'e4', source: 'root', target: 'n2' },
  ],
  mindmap: {
    root: {
      id: 'root',
      label: 'Jaringan Komputer',
      children: [
        { id: 'n1', label: 'Model OSI', children: [{ id: 'n1_1', label: 'Network Layer' }, { id: 'n1_2', label: 'Transport Layer' }] },
        { id: 'n2', label: 'Protokol TCP/IP' },
      ],
    },
    node_count: 5,
    stale: false,
  },
};

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  ts?: number;
}

export interface ChatStartResponse {
  session: { id: number; document_id: number; status: 'ready' | 'preparing' };
  document: { id: number; title: string };
  messages: ChatMessage[];
  mode: 'new' | 'continue';
}

export const defaultChatStartFixture: ChatStartResponse = {
  session: { id: 1, document_id: 101, status: 'ready' },
  document: { id: 101, title: 'Pengantar Jaringan Komputer & OSI Layer' },
  messages: [
    { id: 1, role: 'assistant', content: 'Halo! Saya siap membantu kamu memahami materi Jaringan Komputer. Ada yang ingin ditanyakan?', timestamp: '2026-11-10T10:00:00Z', ts: 1729700000 },
  ],
  mode: 'continue',
};

export interface ChatSendResponse {
  response: string;
  messages: ChatMessage[];
}

export const defaultChatSendFixture: ChatSendResponse = {
  response: 'Lapisan Network Layer bertanggung jawab atas pengalamatan logis (IP address) dan pemilihan jalur routing terbaik melintasi internetwork.',
  messages: [
    { id: 1, role: 'user', content: 'Apa fungsi utama Network Layer?', timestamp: '2026-11-10T10:01:00Z', ts: 1729700030 },
    { id: 2, role: 'assistant', content: 'Lapisan Network Layer bertanggung jawab atas pengalamatan logis (IP address) dan pemilihan jalur routing terbaik melintasi internetwork.', timestamp: '2026-11-10T10:01:05Z', ts: 1729700035 },
  ],
};

export const defaultCardsBuildFixture = {
  created: 15,
  updated: 0,
};

