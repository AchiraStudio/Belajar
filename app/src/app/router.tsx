import { Link, Route, Routes } from 'react-router';
import { AppShell } from '../components/layout/AppShell';

// Routes are added one at a time as each legacy view is ported (docs/MIGRATION_PLAN.md §7).
// The legacy hash URLs (#/materi/3, #/kuis, ...) are preserved when their views arrive (ADR-6).

function HomePage() {
  return (
    <section>
      <h1>Belajar</h1>
      <p>
        Fondasi aplikasi baru sudah berjalan. Fitur dipindahkan satu per satu dari aplikasi lama;
        masuk dengan akun dan perpustakaan materi menyusul di tahap berikutnya.
      </p>
    </section>
  );
}

function NotFoundPage() {
  return (
    <section role="alert">
      <h1>Halaman tidak ditemukan</h1>
      <p>Alamat yang kamu buka tidak ada atau sudah dipindahkan.</p>
      <p>
        <Link to="/">Kembali ke beranda</Link>
      </p>
    </section>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
