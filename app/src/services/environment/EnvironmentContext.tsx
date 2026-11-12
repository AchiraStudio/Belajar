import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type EducationEnvironment = 'sd' | 'smp' | 'sma' | 'pt' | 'umum';

export interface EnvironmentInfo {
  id: EducationEnvironment;
  label: string;
  short: string;
  description: string;
  /** What this environment will tune once the server stores it (shown honestly in Profil). */
  tunes: string[];
}

export const ENVIRONMENTS: EnvironmentInfo[] = [
  {
    id: 'sd',
    label: 'Sekolah Dasar (SD)',
    short: 'SD',
    description: 'Dasar-dasar belajar dengan bahasa sederhana, penjelasan visual, dan sesi pendek.',
    tunes: ['Bahasa penjelasan lebih sederhana', 'Sesi belajar pendek', 'Fitur sosial dibatasi'],
  },
  {
    id: 'smp',
    label: 'Sekolah Menengah Pertama (SMP)',
    short: 'SMP',
    description: 'Belajar terpandu per mata pelajaran, eksplorasi, dan tantangan terstruktur.',
    tunes: ['Penjelasan terpandu per mata pelajaran', 'Tantangan terstruktur'],
  },
  {
    id: 'sma',
    label: 'SMA / SMK',
    short: 'SMA/SMK',
    description: 'Persiapan ujian, peminatan, beasiswa, kompetisi, dan eksplorasi kuliah atau karier.',
    tunes: ['Fokus persiapan ujian', 'Beasiswa dan kompetisi', 'Portofolio'],
  },
  {
    id: 'pt',
    label: 'Perguruan Tinggi',
    short: 'Kuliah',
    description: 'Alur belajar lanjutan: bacaan riset, proyek, magang, beasiswa, dan portofolio profesional.',
    tunes: ['Bacaan riset dan sitasi', 'Magang dan beasiswa', 'Portofolio profesional'],
  },
  {
    id: 'umum',
    label: 'Umum / Belajar Sepanjang Hayat',
    short: 'Umum',
    description: 'Untuk pelajar mandiri atau dewasa di luar struktur sekolah formal.',
    tunes: ['Tanpa asumsi jenjang', 'Topik sesuai minat'],
  },
];

const STORAGE_KEY = 'stuby-environment';

export function isEnvironment(value: unknown): value is EducationEnvironment {
  return typeof value === 'string' && ENVIRONMENTS.some((e) => e.id === value);
}

function readStored(): EducationEnvironment | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isEnvironment(raw) ? raw : null;
  } catch {
    return null;
  }
}

interface EnvironmentContextValue {
  environment: EducationEnvironment | null;
  info: EnvironmentInfo | null;
  setEnvironment: (id: EducationEnvironment | null) => void;
}

const EnvironmentContext = createContext<EnvironmentContextValue>({
  environment: null,
  info: null,
  setEnvironment: () => {},
});

/**
 * The learner's education environment. It is stored ON THIS DEVICE only: the server profile has no
 * education-level field yet, and this app does not invent one. Changing it never touches learning
 * history or the account.
 */
export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [environment, setState] = useState<EducationEnvironment | null>(readStored);

  const setEnvironment = useCallback((id: EducationEnvironment | null) => {
    setState(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable: the choice lasts for this session */
    }
  }, []);

  const value = useMemo<EnvironmentContextValue>(
    () => ({ environment, info: ENVIRONMENTS.find((e) => e.id === environment) ?? null, setEnvironment }),
    [environment, setEnvironment],
  );

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironment(): EnvironmentContextValue {
  return useContext(EnvironmentContext);
}
