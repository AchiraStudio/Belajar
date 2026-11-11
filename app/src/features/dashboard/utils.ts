export function fmtDur(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 mnt';
  if (seconds < 60) return `${Math.round(seconds)} dtk`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} mnt`;
  const hours = (seconds / 3600).toFixed(1).replace('.0', '');
  return `${hours} jam`;
}

export function relDay(val: string | number | undefined): string {
  if (!val) return '–';
  let date: Date;
  if (typeof val === 'number') {
    date = new Date(val > 10_000_000_000 ? val : val * 1000);
  } else {
    date = new Date(val);
  }
  if (isNaN(date.getTime())) return String(val);

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Hari ini';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function fileKind(filename?: string): 'PDF' | 'DOCX' | 'PPTX' | 'IMG' | 'TXT' {
  if (!filename) return 'PDF';
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'PDF';
  if (ext === 'docx' || ext === 'doc') return 'DOCX';
  if (ext === 'pptx' || ext === 'ppt') return 'PPTX';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext || '')) return 'IMG';
  return 'TXT';
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function tone(pct: number): 'good' | 'mid' | 'bad' {
  if (pct >= 80) return 'good';
  if (pct >= 60) return 'mid';
  return 'bad';
}
