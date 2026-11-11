import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../components/ui';
import { OpportunitiesView } from './OpportunitiesView';

const NOW = Date.now() / 1000;
const DAY = 86_400;

const opp = (over: Record<string, unknown>) => ({
  id: 1,
  title: 'Beasiswa A',
  description: 'Deskripsi A',
  category: 'scholarship',
  organizer: 'Yayasan A',
  deadline: NOW + 40 * DAY,
  reward: 'Biaya kuliah penuh',
  target_majors: ['Teknik'],
  eligibility: 'IPK 3.0',
  website_url: 'https://example.org/a',
  guideline_url: 'javascript:alert(1)',
  guideline_text: null,
  is_published: 1,
  created_at: 1,
  updated_at: 1,
  ...over,
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('OpportunitiesView', () => {
  let tracked: { id: number; opportunity_id: number }[] = [];
  const requests: string[] = [];

  beforeEach(() => {
    cleanup();
    tracked = [];
    requests.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost');
        const method = init?.method ?? 'GET';
        requests.push(`${method} ${url.pathname}${url.search}`);
        if (url.pathname.endsWith('/opportunities')) {
          return json({
            opportunities: [
              opp({ id: 2, title: 'Lomba Lama', category: 'competition', deadline: NOW - 3 * DAY }),
              opp({ id: 1 }),
              opp({ id: 3, title: 'Beasiswa Mendesak', deadline: NOW + 3 * DAY - 100 }),
            ],
          });
        }
        if (url.pathname.endsWith('/tracked-opportunities') && method === 'GET') return json({ tracked });
        if (url.pathname.endsWith('/tracked-opportunities') && method === 'POST') {
          const body = JSON.parse(String(init?.body));
          const row = { id: 50, opportunity_id: body.opportunity_id, status: 'Saved', countdown_seconds: 1, is_overdue: false, remind: false, opportunity: null };
          tracked = [row];
          return json({ tracked: row }, 201);
        }
        return json({ error: { code: 'not_found', message: 'x' } }, 404);
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const view = () =>
    render(
      <ToastProvider>
        <OpportunitiesView />
      </ToastProvider>,
    );

  it('derives status from deadlines, sinks closed listings, and never calls an expired one open', async () => {
    view();
    await screen.findByText('Beasiswa A');

    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    const iA = titles.indexOf('Beasiswa A');
    const iUrgent = titles.indexOf('Beasiswa Mendesak');
    const iOld = titles.indexOf('Lomba Lama');
    expect(iUrgent).toBeLessThan(iA); // soonest deadline first
    expect(iOld).toBeGreaterThan(iA); // closed last

    const badges = screen.getAllByRole('status').map((b) => b.textContent);
    expect(badges).toContain('Ditutup 3 hari lagi');
    expect(badges).toContain('Dibuka');
    expect(badges).toContain('Ditutup');
    // The expired listing is labelled closed and is never the open one.
    expect(badges.indexOf('Ditutup')).toBeGreaterThan(badges.indexOf('Dibuka'));
  });

  it('is honest about trust: no verification claims, and a disclaimer is present', async () => {
    view();
    await screen.findByText('Beasiswa A');
    expect(screen.queryByText(/verified|terverifikasi/i)).toBeNull();
    expect(screen.getByText(/belum memiliki status verifikasi sumber/)).toBeTruthy();
    expect(screen.getByText(/Berita pendidikan, magang, dan acara/)).toBeTruthy();
  });

  it('only links http(s) URLs in the detail dialog and offers copy for the rest', async () => {
    view();
    fireEvent.click(await screen.findByRole('button', { name: 'Beasiswa A' }));
    const dialog = await screen.findByRole('dialog');
    const links = Array.from(dialog.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['https://example.org/a']); // the javascript: guideline URL is dropped
    expect(dialog.textContent).toContain('IPK 3.0');
  });

  it('saves an opportunity through the tracking API and reflects it', async () => {
    view();
    await screen.findByText('Beasiswa A');
    const save = screen.getAllByRole('button', { name: 'Simpan' })[0] as HTMLElement;
    fireEvent.click(save);
    await waitFor(() => expect(requests.some((r) => r.startsWith('POST') && r.includes('/tracked-opportunities'))).toBe(true));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Tersimpan' }).length).toBeGreaterThan(0));
  });

  it('shows an empty state when the server has no published listings', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (String(input).includes('tracked') ? json({ tracked: [] }) : json({ opportunities: [] }))));
    view();
    expect(await screen.findByRole('heading', { name: 'Tidak ada peluang yang cocok' })).toBeTruthy();
  });
});
