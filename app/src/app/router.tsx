import { lazy } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router';
import { AppShell } from '../components/layout/AppShell';
import { DashboardView } from '../features/dashboard';
import { MaterialsView } from '../features/materials';

// Dashboard and the library are in the main bundle (first screens). Everything else is split into
// its own chunk and loaded on first visit; AppShell keeps the navigation mounted while it loads.
const WorkspaceShell = lazy(() => import('../features/workspace').then((m) => ({ default: m.WorkspaceShell })));
const QuizzesView = lazy(() => import('../features/quizzes').then((m) => ({ default: m.QuizzesView })));
const QuizRunner = lazy(() => import('../features/quizzes').then((m) => ({ default: m.QuizRunner })));
const QuizResult = lazy(() => import('../features/quizzes').then((m) => ({ default: m.QuizResult })));
const WeakQuestionsView = lazy(() => import('../features/quizzes').then((m) => ({ default: m.WeakQuestionsView })));
const FlashcardsView = lazy(() => import('../features/flashcards').then((m) => ({ default: m.FlashcardsView })));
const ProgressView = lazy(() => import('../features/progress').then((m) => ({ default: m.ProgressView })));
const GamesHub = lazy(() => import('../features/games').then((m) => ({ default: m.GamesHub })));
const ConceptMap = lazy(() => import('../features/games').then((m) => ({ default: m.ConceptMap })));
const GameSession = lazy(() => import('../features/games').then((m) => ({ default: m.GameSession })));
const OpportunitiesView = lazy(() => import('../features/opportunities').then((m) => ({ default: m.OpportunitiesView })));
const ProfileView = lazy(() => import('../features/profile').then((m) => ({ default: m.ProfileView })));
const SettingsView = lazy(() => import('../features/settings').then((m) => ({ default: m.SettingsView })));
const CommunityView = lazy(() => import('../features/platform').then((m) => ({ default: m.CommunityView })));
const MessagesView = lazy(() => import('../features/platform').then((m) => ({ default: m.MessagesView })));
const NotificationsView = lazy(() => import('../features/platform').then((m) => ({ default: m.NotificationsView })));
const AssistantView = lazy(() => import('../features/platform').then((m) => ({ default: m.AssistantView })));
const HelpView = lazy(() => import('../features/platform').then((m) => ({ default: m.HelpView })));

// Routes are added as each legacy view is ported (docs/MIGRATION_PLAN.md §7). The legacy hash
// URLs (#/materi/3, #/kuis, #/latihan/7, #/hasil/7, #/game/peta, ...) stay valid (ADR-6).

function NotFoundPage() {
  return (
    <section role="alert" style={{ padding: '32px' }}>
      <h1>Halaman tidak ditemukan</h1>
      <p>Alamat yang kamu buka tidak ada atau sudah dipindahkan.</p>
      <p>
        <Link to="/">Kembali ke beranda</Link>
      </p>
    </section>
  );
}

/** Legacy deep link `#/chat/:id` now opens the chat tab of the material workspace. */
function LegacyChatRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/materi/${id ?? ''}?tab=chat`} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardView />} />

        {/* Belajar */}
        <Route path="materi" element={<MaterialsView />} />
        <Route path="materi/:id" element={<WorkspaceShell />} />
        <Route path="chat/:id" element={<LegacyChatRedirect />} />
        <Route path="kuis" element={<QuizzesView />} />
        <Route path="latihan/:attemptId" element={<QuizRunner />} />
        <Route path="hasil/:attemptId" element={<QuizResult />} />
        <Route path="soal-lemah" element={<WeakQuestionsView />} />
        <Route path="kartu" element={<FlashcardsView />} />
        <Route path="progres" element={<ProgressView />} />

        {/* Jelajahi */}
        <Route path="peluang" element={<OpportunitiesView />} />
        <Route path="komunitas" element={<CommunityView />} />

        {/* Game & Tantangan */}
        <Route path="game" element={<GamesHub />} />
        <Route path="game/peta" element={<ConceptMap />} />
        <Route path="game/main/:runId" element={<GameSession />} />
        <Route path="game/run" element={<GameSession />} />

        {/* Pertumbuhan, pesan, bantuan, preferensi */}
        <Route path="profil" element={<ProfileView />} />
        <Route path="pesan" element={<MessagesView />} />
        <Route path="notifikasi" element={<NotificationsView />} />
        <Route path="asisten" element={<AssistantView />} />
        <Route path="bantuan" element={<HelpView />} />
        <Route path="pengaturan" element={<SettingsView />} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
