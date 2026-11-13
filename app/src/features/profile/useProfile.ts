import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch } from '../../services/api/client';
import { rpcCall } from '../../services/api/rpc';
import { tr } from '../../services/i18n';
import { buildDashboardModel, type DashboardModel } from '../dashboard/normalize';
import type { DashboardResponse } from '../dashboard/types';
import { readExtras, writeExtras, type PeerProfile, type ProfileExtras } from './profileModel';

export interface ProfileLoadError {
  message: string;
  /** The session is not known to the profile API (it is separate from the main session). */
  auth: boolean;
}

/** What `PUT /profiles/me` takes from this page; every field is optional on the server. */
export interface ProfileSave {
  full_name?: string;
  major?: string;
  batch_year?: number | null;
  bio?: string;
  academic_interests?: string[];
  skills?: string[];
  extras?: ProfileExtras;
}

export function useProfile() {
  const [profile, setProfile] = useState<PeerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ProfileLoadError | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ profile: PeerProfile }>('/profiles/me', { signal });
      setProfile(res.profile);
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      const auth = err instanceof ApiError && (err.status === 401 || err.status === 403);
      setError({ message: err instanceof Error ? err.message : tr('Gagal memuat profil.'), auth });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /** Saves and returns the stored profile. Throws the server's message on failure so the caller can show it. */
  const save = useCallback(
    async (patch: ProfileSave): Promise<PeerProfile> => {
      const { extras, ...columns } = patch;
      const body: Record<string, unknown> = { ...columns };
      if (extras) body.contact_info = writeExtras(profile?.contact_info, extras);
      const res = await apiFetch<{ profile: PeerProfile }>('/profiles/me', { method: 'PUT', body });
      setProfile(res.profile);
      return res.profile;
    },
    [profile?.contact_info],
  );

  const extras = useMemo(() => readExtras(profile?.contact_info), [profile?.contact_info]);

  return { profile, extras, loading, error, reload: () => load(), save };
}

/** The study numbers shown under the name. They come from the same `dashboard` answer as the home page. */
export function useProfileStats() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setData(await rpcCall<DashboardResponse>('dashboard'));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const model: DashboardModel | null = useMemo(() => (data ? buildDashboardModel(data) : null), [data]);
  return { data, model, loading, failed, reload: load };
}
