/* All page copy and sample data lives here, apart from the components that render it.
   Facts come from the Stuby README and the app; sample UI is labelled "sample" where it appears. */

export const REPO_URL = 'https://github.com/AchiraStudio/stuby';

export const NAV = [
  { id: 'loop', label: 'The loop' },
  { id: 'play', label: 'Games' },
  { id: 'honest', label: 'Honest data' },
  { id: 'phone', label: 'On your phone' },
  { id: 'run', label: 'Run it' },
  { id: 'private', label: 'Privacy' },
] as const;

export const HERO_FACTS = [
  { k: 'Reads', v: 'PDF, DOCX, PPTX, images, TXT and Markdown, up to 40 MB each' },
  { k: 'Runs as', v: 'A desktop app, a self-hosted web app, an Android app' },
  { k: 'Speaks', v: 'English, Bahasa Indonesia, Español, 中文' },
] as const;

/* ------------------------------------------------------------------ the loop */

export const STAGES = [
  { id: 'lib', n: '01', title: 'Upload a file', desc: 'Text, scans and slides become something to study' },
  { id: 'notes', n: '02', title: 'Read the notes', desc: 'Seven note styles, and a chat for every document' },
  { id: 'map', n: '03', title: 'See the map', desc: 'The concepts and how they connect' },
  { id: 'quiz', n: '04', title: 'Take a quiz', desc: 'Practice with feedback, or a timed exam' },
  { id: 'cards', n: '05', title: 'Review the cards', desc: 'Spaced repetition decides what comes back' },
  { id: 'prog', n: '06', title: 'Watch it stick', desc: 'Streaks, goals and mastery from real answers' },
] as const;

export type NoteStyle = 'cornell' | 'outline' | 'worked';
export const NOTE_STYLES: { value: NoteStyle; label: string }[] = [
  { value: 'cornell', label: 'Cornell' },
  { value: 'outline', label: 'Outline' },
  { value: 'worked', label: 'Worked example' },
];

export type QuizType = 'mc' | 'tf' | 'sa';
export const QUIZ_TYPES: { value: QuizType; label: string }[] = [
  { value: 'mc', label: 'Multiple choice' },
  { value: 'tf', label: 'True or false' },
  { value: 'sa', label: 'Short answer' },
];
export type QuizMode = 'practice' | 'exam';
export const QUIZ_MODES: { value: QuizMode; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'exam', label: 'Exam' },
];

export interface ChoiceQuestion {
  text: string;
  opts: string[];
  right: number;
  why: string;
  src: string;
}
export const CHOICE_QUESTIONS: Record<'mc' | 'tf', ChoiceQuestion> = {
  mc: {
    text: 'In a Carnot engine, what happens to the efficiency if the cold reservoir gets hotter while the hot side stays fixed?',
    opts: ['It rises', 'It falls', 'It stays the same', 'It depends on the working fluid'],
    right: 1,
    why: 'η = 1 − Tc / Th. A larger Tc makes the ratio bigger, so η falls.',
    src: 'Sample question, cited to page 14 of a sample PDF',
  },
  tf: {
    text: "A Carnot engine's efficiency can be calculated with temperatures in °C.",
    opts: ['True', 'False'],
    right: 1,
    why: 'The ratio needs an absolute scale, so the temperatures must be in kelvin.',
    src: 'Sample question, cited to page 15 of a sample PDF',
  },
};
export const SHORT_ANSWER = {
  text: 'Which temperature scale must you use in the Carnot efficiency formula?',
  src: 'Sample question, cited to page 14 of a sample PDF',
};

export const CARD_DECK = [
  { front: 'Carnot efficiency formula', back: 'η = 1 − Tc / Th, with temperatures in kelvin' },
  { front: 'Which two kinds of process make up a Carnot cycle?', back: 'Two isothermal steps and two adiabatic steps' },
  { front: "Why can't a real engine beat a Carnot engine between the same temperatures?", back: 'The Carnot cycle is reversible. Real engines lose energy to irreversibility.' },
] as const;

export const GRADES = [
  { key: 'again', label: 'Again', hint: 'Not yet' },
  { key: 'hard', label: 'Hard', hint: 'Recalled with effort' },
  { key: 'good', label: 'Good', hint: 'Recalled' },
  { key: 'easy', label: 'Easy', hint: 'Very easy' },
] as const;
export type GradeKey = (typeof GRADES)[number]['key'];

/** Mind map layout in a 720 x 380 viewBox. Branch and leaf positions are the original sample. */
export const MAP = {
  root: { x: 40, y: 202, w: 150, h: 56, label: 'Carnot cycle' },
  branches: [
    { id: 'b1', x: 250, y: 64, w: 130, h: 44, label: 'Four steps', tone: 'leaf', leaves: ['Isothermal expansion', 'Adiabatic expansion', 'Isothermal compression', 'Adiabatic compression'], leafY: [10, 50, 90, 130] },
    { id: 'b2', x: 250, y: 204, w: 130, h: 44, label: 'Efficiency', tone: 'sun', leaves: ['η = 1 − Tc / Th', 'Temperatures in kelvin'], leafY: [190, 230] },
    { id: 'b3', x: 250, y: 304, w: 130, h: 44, label: 'Limits', tone: 'cream', leaves: ['Only reversible cycles reach it', 'No real engine beats it'], leafY: [290, 330] },
  ],
  leafX: 440,
  leafW: 250,
  leafH: 32,
} as const;

export const HEAT_SEED = 20240611;

/* --------------------------------------------------------------------- games */

export const SPOT_SENTENCES = [
  'A Carnot engine is the most efficient engine possible between two temperatures.',
  'Its efficiency is 1 − Tc / Th, with both temperatures in kelvin.',
  'Warming the cold reservoir raises the efficiency.',
  'No real engine working between the same two temperatures can beat it.',
];
export const SPOT_WRONG = 2;

/* ------------------------------------------------------------------ language */

export const LANGS = {
  en: { label: 'English', hi: 'Good afternoon.', level: 'Choose your level', cont: 'Continue studying', nav: ['Home', 'Materials', 'Quizzes', 'Cards', 'Progress'] },
  id: { label: 'Bahasa Indonesia', hi: 'Selamat sore.', level: 'Pilih jenjangmu', cont: 'Lanjutkan belajar', nav: ['Beranda', 'Materi', 'Kuis', 'Kartu', 'Progres'] },
  es: { label: 'Español', hi: 'Buenas tardes.', level: 'Elige tu nivel', cont: 'Continuar estudiando', nav: ['Inicio', 'Materiales', 'Quiz', 'Tarjetas', 'Progreso'] },
  zh: { label: '中文', hi: '下午好.', level: '选择你的学习阶段', cont: '继续学习', nav: ['首页', '资料', '测验', '卡片', '进度'] },
} as const;
export type LangKey = keyof typeof LANGS;

/* ---------------------------------------------------------------- phone dock */

export interface DockItem { name: string; soon?: boolean }
export interface DockTab { id: string; label: string; icon: 'home' | 'folder' | 'quiz' | 'game' | 'menu'; menu: DockItem[] }
export const DOCK_TABS: DockTab[] = [
  { id: 'home', label: 'Home', icon: 'home', menu: [{ name: 'Home' }, { name: 'Notifications', soon: true }, { name: 'Messages', soon: true }] },
  { id: 'materials', label: 'Materials', icon: 'folder', menu: [{ name: 'Materials' }, { name: 'Cards' }, { name: 'AI assistant', soon: true }] },
  { id: 'quizzes', label: 'Quizzes', icon: 'quiz', menu: [{ name: 'Quizzes' }, { name: 'Weak questions' }, { name: 'Progress' }] },
  { id: 'games', label: 'Games', icon: 'game', menu: [{ name: 'Games' }, { name: 'Opportunities' }, { name: 'Community', soon: true }] },
  { id: 'more', label: 'More', icon: 'menu', menu: [{ name: 'Profile' }, { name: 'Settings' }, { name: 'Help and security' }] },
];

/* -------------------------------------------------------------------- run it */

export const PLATFORMS = [
  { name: 'Desktop', text: 'Windows, macOS and Linux. The app starts its own server on a loopback port and shows it, so there is nothing to launch first. The first run asks for a database address and a password.', status: 'Build from source', dim: false },
  { name: 'Web, on a Linux server', text: 'One script builds and installs a hardened systemd service. Put Caddy in front for HTTPS and open it from any browser.', status: 'Build from source', dim: false },
  { name: 'Android', text: "A Tauri shell that loads the UI from your server's address, so session cookies stay on a single origin.", status: 'Build from source', dim: false },
  { name: 'iOS', text: 'Not built yet.', status: 'Not available', dim: true },
] as const;

export const COMMANDS = {
  mock: 'npm install\nnpm run dev:mock',
  real: 'npm install\ncargo run -p stuby-server\nnpm run dev:react',
};

/* ------------------------------------------------------------------- privacy */

export const PRIVACY_ROWS: { title: string; code?: string; text: string; after?: string }[] = [
  { title: 'Login and sessions.', text: 'A password login, with sessions stored server-side and carried in', code: 'SameSite=Strict', after: 'cookies. The password can be configured as an Argon2 hash.' },
  { title: 'A restricted database role.', text: "Row-level security is enabled on every table and forced on data tables, so queries only see the owner's rows." },
  { title: 'No secrets in the binary.', text: 'They live in the environment or in a', code: 'stuby.env', after: 'file on your machine.' },
  { title: 'Strict Content-Security-Policy.', text: 'User content is sanitized before it is rendered.' },
  { title: 'AI output is untrusted.', text: 'It is validated before use, and game answer keys stay on the server until a turn is judged.' },
];

export const LIMITS: { text: string; code?: [string, string]; tail?: string }[] = [
  { text: 'Community, direct messages, notifications and the AI assistant that spans all your materials are visible as "coming soon". They have no backend yet.' },
  { text: 'One owner per server. The desktop app is single-user and single-machine.' },
  { text: 'Generating notes, quizzes and games needs a reachable AI gateway. Material that is already generated, plus flashcards and progress, keep working without one.' },
  { text: 'Legacy .doc and .ppt files are not supported. Re-save them as .docx or .pptx.' },
  { text: 'The home screen, settings and login are fully translated. Other screens still show Indonesian while they are migrated.' },
  { text: 'There is no iOS build.' },
];
