import React, { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, Icon, PageHeader, ProgressBar, Select, Skeleton, SurfaceCard } from '../../components/ui';
import { useRpcQuery } from '../../hooks/useRpcQuery';
import { parseScope, type ConceptRow, type GameHub } from './types';
import styles from './Games.module.css';
import { tr } from '../../services/i18n';

/**
 * Concept mastery map. Scores and evidence counts come straight from `concepts_list`; the level
 * labels (Baru/Dikenal/Paham/Kuasai) are server-computed and shown in the hub summary. The
 * client does not re-derive mastery from the raw numbers.
 */
export function ConceptMap() {
  const hub = useRpcQuery<Pick<GameHub, 'documents' | 'subjects' | 'levels'>>('play_hub');
  const [scope, setScope] = useState('all');
  const payload = useMemo(() => {
    const s = parseScope(scope);
    if (s.scope_kind === 'document') return { document_id: s.scope_id };
    if (s.scope_kind === 'subject') return { subject_id: s.scope_id };
    return {};
  }, [scope]);
  const { data, loading, error, reload } = useRpcQuery<{ concepts: ConceptRow[]; count: number }>('concepts_list', payload);

  const grouped = useMemo(() => {
    const map = new Map<string, ConceptRow[]>();
    for (const c of data?.concepts ?? []) {
      const list = map.get(c.doc_title) ?? [];
      list.push(c);
      map.set(c.doc_title, list);
    }
    return [...map.entries()];
  }, [data]);

  const options = [
    { value: 'all', label: tr('Semua materi') },
    ...(hub.data?.subjects ?? []).map((s) => ({ value: `s:${s.id}`, label: `Mata pelajaran: ${s.name}` })),
    ...(hub.data?.documents ?? []).map((d) => ({ value: `d:${d.id}`, label: d.title })),
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={tr('Game & Tantangan')}
        title={tr('Peta Penguasaan Konsep')}
        description={tr('Setiap istilah dari materimu, dengan skor dan jumlah bukti. Penguasaan naik lewat game dan kuis, bukan karena sekadar membuka halaman.')}
        actions={
          <Link to="/game" className={styles.chipLink}>
            <Icon name="arrow-left" size={15} />{' '}{tr('Kembali ke game')}
          </Link>
        }
      />

      {hub.data?.levels && (
        <dl className={styles.levelRow} aria-label={tr('Ringkasan penguasaan')}>
          <div><dt>{tr('Baru')}</dt><dd>{hub.data.levels.baru}</dd></div>
          <div><dt>{tr('Dikenal')}</dt><dd>{hub.data.levels.dikenal}</dd></div>
          <div><dt>{tr('Paham')}</dt><dd>{hub.data.levels.paham}</dd></div>
          <div><dt>{tr('Kuasai')}</dt><dd>{hub.data.levels.kuasai}</dd></div>
        </dl>
      )}

      <div className={styles.scopeSelect}>
        <Select label={tr('Tampilkan konsep dari')} value={scope} onChange={(e) => setScope(e.target.value)} options={options} />
      </div>

      {loading && !data && <Skeleton height="220px" borderRadius="20px" aria-label={tr('Memuat konsep')} />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}

      {data && data.count === 0 && (
        <EmptyState
          icon="compass"
          title={tr('Belum ada konsep')}
          description={tr('Konsep dibuat dari istilah kunci materi yang sudah selesai diproses.')}
        />
      )}

      {grouped.map(([title, concepts]) => (
        <SurfaceCard key={title} className={styles.panel}>
          <h2 className={styles.panelTitle}>{title}</h2>
          <ul className={styles.conceptList}>
            {concepts.map((c) => (
              <li key={c.id} className={styles.concept}>
                <div className={styles.conceptTop}>
                  <span className={styles.conceptTerm}>{c.term}</span>
                  <span className={styles.conceptMeta}>
                    {c.evidence_n > 0 ? `${Math.round(c.score)} · ${c.evidence_n} bukti` : tr('Belum dilatih')}
                  </span>
                </div>
                <ProgressBar
                  value={c.evidence_n > 0 ? c.score : null}
                  label={`Penguasaan ${c.term}`}
                  tone={c.evidence_n === 0 ? 'accent' : c.score >= 75 ? 'success' : c.score >= 50 ? 'accent' : 'warning'}
                />
                <p className={styles.conceptDef}>{c.definition}</p>
              </li>
            ))}
          </ul>
        </SurfaceCard>
      ))}
    </div>
  );
}
