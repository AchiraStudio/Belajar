import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  Dropdown,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  PageHeader,
  Skeleton,
  StatusBadge,
  SurfaceCard,
  Tabs,
  useToast,
} from '../../components/ui';
import { ApiError } from '../../services/api/client';
import { copyText } from '../../services/files';
import { fetchOpportunities, fetchTracked, trackOpportunity, untrack } from './api';
import type { Opportunity, TrackedOpportunity } from './types';
import { categoryLabel, deadlineState, formatDeadline, safeUrl } from './utils';
import styles from './Opportunities.module.css';
import { tr } from '../../services/i18n';

type CategoryTab = 'all' | 'scholarship' | 'competition' | 'saved';
type StatusFilter = 'all' | 'open' | 'soon' | 'closed';

const STATUS_BADGE = { open: 'success', soon: 'warning', closed: 'neutral' } as const;

export function OpportunitiesView() {
  const toast = useToast();
  const [tab, setTab] = useState<CategoryTab>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [major, setMajor] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [items, setItems] = useState<Opportunity[] | null>(null);
  const [tracked, setTracked] = useState<TrackedOpportunity[]>([]);
  const [trackedUnavailable, setTrackedUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchOpportunities(
      { category: tab === 'scholarship' || tab === 'competition' ? tab : undefined, search: debounced, major },
      controller.signal,
    )
      .then((list) => {
        setItems(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : tr('Gagal memuat peluang.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, debounced, major, tick]);

  useEffect(() => {
    const controller = new AbortController();
    fetchTracked(controller.signal)
      .then((list) => {
        setTracked(list);
        setTrackedUnavailable(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // Saving needs a signed-in user on the v1 API; without one we say so instead of faking it.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) setTrackedUnavailable(true);
      });
    return () => controller.abort();
  }, [tick]);

  const trackedByOpp = useMemo(() => new Map(tracked.map((t) => [t.opportunity_id, t])), [tracked]);

  const visible = useMemo(() => {
    let list = items ?? [];
    if (tab === 'saved') list = list.filter((o) => trackedByOpp.has(o.id));
    if (status !== 'all') list = list.filter((o) => deadlineState(o.deadline).kind === status);
    // Closed listings sink to the bottom; nothing expired is ever presented as currently open.
    return [...list].sort((a, b) => {
      const ca = deadlineState(a.deadline).kind === 'closed' ? 1 : 0;
      const cb = deadlineState(b.deadline).kind === 'closed' ? 1 : 0;
      return ca - cb || a.deadline - b.deadline;
    });
  }, [items, tab, status, trackedByOpp]);

  const toggleSave = useCallback(
    async (opp: Opportunity) => {
      if (busyId !== null) return;
      setBusyId(opp.id);
      try {
        const existing = trackedByOpp.get(opp.id);
        if (existing) {
          await untrack(existing.id);
          setTracked((prev) => prev.filter((t) => t.id !== existing.id));
          toast.success(tr('Dihapus dari tersimpan'));
        } else {
          const created = await trackOpportunity(opp.id);
          setTracked((prev) => [...prev, created]);
          toast.success(tr('Disimpan ke daftarmu'));
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tr('Gagal menyimpan peluang.'));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, trackedByOpp, toast],
  );

  const selected = items?.find((o) => o.id === openId) ?? null;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={tr('Beasiswa & Peluang')}
        title={tr('Beasiswa & Peluang')}
        description={tr('Beasiswa dan kompetisi yang tercatat di server. Selalu periksa syarat dan tanggal di situs resmi penyelenggara sebelum mendaftar.')}
      />

      <div className={styles.trust} role="note">
        <Icon name="shield" size={18} />
        <div>
          <strong>{tr('Cara membaca daftar ini')}</strong>
          <p>
            {tr('Status “Dibuka / Ditutup” dihitung dari tanggal batas yang tercatat. Data ini belum memiliki status verifikasi sumber, jadi anggap sebagai petunjuk awal dan konfirmasi ke situs resmi. Stuby tidak menjamin kelayakan, pendanaan, atau penerimaan.')}
          </p>
        </div>
      </div>

      <div className={styles.controls}>
        <Tabs
          variant="segmented"
          activeTab={tab}
          onChange={(id) => setTab(id as CategoryTab)}
          items={[
            { id: 'all', label: 'Semua' },
            { id: 'scholarship', label: 'Beasiswa', icon: 'graduation' },
            { id: 'competition', label: 'Kompetisi', icon: 'trophy' },
            { id: 'saved', label: 'Tersimpan', icon: 'bookmark', count: tracked.length },
          ]}
        />
        <div className={styles.filters}>
          <Input
            label={tr('Cari')}
            icon="search"
            type="search"
            placeholder={tr('Nama, penyelenggara, kata kunci')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            clearable
            onClear={() => setSearch('')}
          />
          <Input label={tr('Bidang / jurusan')} placeholder={tr('mis. Teknik, Kedokteran')} value={major} onChange={(e) => setMajor(e.target.value)} />
          <div className={styles.statusField}>
            <label htmlFor="opp-status" className={styles.fieldLabel}>
              {tr('Status batas waktu')}
            </label>
            <Dropdown
              id="opp-status"
              value={status}
              onChange={(v) => setStatus(v as StatusFilter)}
              options={[
                { value: 'all', label: 'Semua' },
                { value: 'open', label: 'Dibuka' },
                { value: 'soon', label: tr('Segera ditutup (≤ 14 hari)') },
                { value: 'closed', label: tr('Sudah ditutup') },
              ]}
            />
          </div>
        </div>
      </div>

      {trackedUnavailable && tab === 'saved' && (
        <div className={styles.note} role="status">
          <Icon name="info" size={16} />
          {tr('Menyimpan peluang membutuhkan sesi masuk yang dikenali API v1. Sesi ini belum bisa menyimpan.')}
        </div>
      )}

      {loading && !items && (
        <div className={styles.grid} aria-busy="true" aria-label={tr('Memuat peluang')}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height="190px" borderRadius="20px" />
          ))}
        </div>
      )}
      {error && !items && <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} />}

      {items && visible.length === 0 && (
        <EmptyState
          icon="graduation"
          title={tab === 'saved' ? tr('Belum ada peluang tersimpan') : tr('Tidak ada peluang yang cocok')}
          description={
            tab === 'saved'
              ? tr('Simpan beasiswa atau kompetisi yang menarik supaya tenggatnya mudah dipantau.')
              : items.length === 0
                ? tr('Belum ada peluang yang dipublikasikan di server ini.')
                : tr('Coba ubah kata kunci atau filter.')
          }
        />
      )}

      {visible.length > 0 && (
        <ul className={styles.grid}>
          {visible.map((o) => {
            const dl = deadlineState(o.deadline);
            const saved = trackedByOpp.has(o.id);
            return (
              <li key={o.id}>
                <SurfaceCard className={`${styles.card} ${dl.kind === 'closed' ? styles.closed : ''}`}>
                  <div className={styles.cardTop}>
                    <span className={styles.cat}>
                      <Icon name={o.category === 'scholarship' ? 'graduation' : 'trophy'} size={14} />
                      {categoryLabel(o.category)}
                    </span>
                    <StatusBadge status={STATUS_BADGE[dl.kind]} label={dl.label} />
                  </div>
                  <h2 className={styles.cardTitle}>
                    <button type="button" className={styles.titleBtn} onClick={() => setOpenId(o.id)}>
                      {o.title}
                    </button>
                  </h2>
                  <p className={styles.org}>{o.organizer || tr('Penyelenggara tidak dicantumkan')}</p>
                  <dl className={styles.facts}>
                    <div>
                      <dt>{tr('Batas waktu')}</dt>
                      <dd>{formatDeadline(o.deadline)}</dd>
                    </div>
                    {o.reward && (
                      <div>
                        <dt>{tr('Manfaat')}</dt>
                        <dd>{o.reward}</dd>
                      </div>
                    )}
                  </dl>
                  {o.target_majors.length > 0 && (
                    <ul className={styles.chips} aria-label={tr('Bidang sasaran')}>
                      {o.target_majors.slice(0, 4).map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                      {o.target_majors.length > 4 && <li>+{o.target_majors.length - 4}</li>}
                    </ul>
                  )}
                  <div className={styles.cardFoot}>
                    <Button size="sm" variant="outline" onClick={() => setOpenId(o.id)}>
                      {tr('Lihat detail')}
                    </Button>
                    <Button
                      size="sm"
                      variant={saved ? 'secondary' : 'ghost'}
                      icon="bookmark"
                      loading={busyId === o.id}
                      aria-pressed={saved}
                      onClick={() => void toggleSave(o)}
                    >
                      {saved ? tr('Tersimpan') : tr('Simpan')}
                    </Button>
                  </div>
                </SurfaceCard>
              </li>
            );
          })}
        </ul>
      )}

      <SurfaceCard className={styles.soon}>
        <div className={styles.soonHead}>
          <Icon name="globe" size={18} />
          <h2>{tr('Berita pendidikan, magang, dan acara')}</h2>
          <StatusBadge status="neutral" label={tr('Belum tersedia')} />
        </div>
        <p>
          {tr('Berita, magang, dan acara membutuhkan pengumpulan sumber, penyuntingan, dan verifikasi yang belum ada di server ini. Hanya beasiswa dan kompetisi yang tampil di atas, dan datanya apa adanya dari server.')}
        </p>
      </SurfaceCard>

      <OpportunityDialog
        opp={selected}
        saved={selected ? trackedByOpp.has(selected.id) : false}
        busy={busyId === selected?.id}
        onToggleSave={() => selected && void toggleSave(selected)}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function OpportunityDialog({
  opp,
  saved,
  busy,
  onToggleSave,
  onClose,
}: {
  opp: Opportunity | null;
  saved: boolean;
  busy: boolean;
  onToggleSave: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const site = safeUrl(opp?.website_url);
  const guide = safeUrl(opp?.guideline_url);
  const dl = opp ? deadlineState(opp.deadline) : null;

  const copy = async (url: string) => {
    (await copyText(url)) ? toast.success(tr('Tautan disalin')) : toast.error(tr('Tidak bisa menyalin tautan.'));
  };

  return (
    <Dialog
      open={opp !== null}
      onClose={onClose}
      size="lg"
      title={opp?.title ?? ''}
      description={opp ? `${categoryLabel(opp.category)} · ${opp.organizer || tr('Penyelenggara tidak dicantumkan')}` : undefined}
      footer={
        opp && (
          <>
            <Button variant="ghost" onClick={onClose}>
              {tr('Tutup')}
            </Button>
            <Button variant={saved ? 'secondary' : 'outline'} icon="bookmark" loading={busy} onClick={onToggleSave}>
              {saved ? tr('Tersimpan') : tr('Simpan')}
            </Button>
          </>
        )
      }
    >
      {opp && dl && (
        <div className={styles.detail}>
          <div className={styles.detailHead}>
            <StatusBadge status={STATUS_BADGE[dl.kind]} label={dl.label} />
            <span>{tr('Batas waktu:')}{' '}{formatDeadline(opp.deadline)}</span>
          </div>
          {dl.kind === 'closed' && (
            <div className={styles.note} role="status">
              <Icon name="info" size={16} />{' '}{tr('Batas waktu sudah lewat menurut data ini. Periksa situs resmi apakah ada perpanjangan.')}
            </div>
          )}
          {opp.description && (
            <section>
              <h3>{tr('Ringkasan')}</h3>
              <p>{opp.description}</p>
            </section>
          )}
          {opp.reward && (
            <section>
              <h3>{tr('Manfaat')}</h3>
              <p>{opp.reward}</p>
            </section>
          )}
          {opp.eligibility && (
            <section>
              <h3>{tr('Persyaratan')}</h3>
              <p>{opp.eligibility}</p>
            </section>
          )}
          {opp.target_majors.length > 0 && (
            <section>
              <h3>{tr('Bidang sasaran')}</h3>
              <ul className={styles.chips}>
                {opp.target_majors.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </section>
          )}
          {opp.guideline_text && (
            <section>
              <h3>{tr('Panduan')}</h3>
              <p className={styles.pre}>{opp.guideline_text}</p>
            </section>
          )}
          <section>
            <h3>{tr('Tautan resmi')}</h3>
            {site || guide ? (
              <ul className={styles.links}>
                {site && (
                  <li>
                    <a href={site} target="_blank" rel="noopener noreferrer">
                      {tr('Situs penyelenggara')}{' '}<Icon name="external-link" size={14} />
                    </a>
                    <button type="button" onClick={() => void copy(site)} aria-label={tr('Salin tautan situs penyelenggara')}>
                      <Icon name="copy" size={14} />{' '}{tr('Salin')}
                    </button>
                  </li>
                )}
                {guide && (
                  <li>
                    <a href={guide} target="_blank" rel="noopener noreferrer">
                      {tr('Dokumen panduan')}{' '}<Icon name="external-link" size={14} />
                    </a>
                    <button type="button" onClick={() => void copy(guide)} aria-label={tr('Salin tautan dokumen panduan')}>
                      <Icon name="copy" size={14} />{' '}{tr('Salin')}
                    </button>
                  </li>
                )}
              </ul>
            ) : (
              <p className={styles.muted}>{tr('Server tidak mencantumkan tautan resmi untuk peluang ini. Cari langsung di situs penyelenggara.')}</p>
            )}
            <p className={styles.muted}>{tr('Tautan ditampilkan apa adanya dari data server. Pastikan domainnya milik penyelenggara resmi sebelum mengisi data pribadi.')}</p>
          </section>
        </div>
      )}
    </Dialog>
  );
}
