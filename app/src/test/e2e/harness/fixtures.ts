import type { Opportunity, PeerProfile } from './contracts';
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

