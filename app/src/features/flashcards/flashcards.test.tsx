import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { mockRpc, renderWithProviders } from '../../test/e2e/harness';
import { dropCache } from '../../services/api/rpc';
import { FlashcardsView } from './FlashcardsView';

const counts = { total: 2, due: 2, new: 1, learning: 1, mature: 0 };

describe('FlashcardsView (SM-2 review)', () => {
  beforeEach(() => {
    cleanup();
    dropCache();
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('play_hub', { documents: [{ id: 1, title: 'Jaringan' }] });
    mockRpc.setResponse('cards_due', {
      cards: [
        { id: 1, front: 'TCP', back: 'Protokol berorientasi koneksi', reps: 0, interval: 0, doc_title: 'Jaringan' },
        { id: 2, front: 'UDP', back: 'Protokol tanpa koneksi', reps: 1, interval: 1, doc_title: 'Jaringan' },
      ],
      counts,
    });
    mockRpc.setResponse('cards_review', { counts });
  });
  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
  });

  it('keeps legacy grades: Lagi=1 re-queues the card, Mudah=5 completes it', async () => {
    renderWithProviders(<FlashcardsView />, { route: '/kartu' });
    fireEvent.click(await screen.findByRole('button', { name: /Mulai review/ }));

    // Card 1: reveal, rate "Lagi" -> grade 1, goes to the back of the queue.
    fireEvent.click(await screen.findByRole('button', { name: /Balik kartu/ }));
    expect(screen.getByText('Protokol berorientasi koneksi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Lagi/ }));
    await waitFor(() => expect(mockRpc.getCalls('cards_review')).toHaveLength(1));
    expect(mockRpc.getLastCall('cards_review')?.payload).toMatchObject({ id: 1, grade: 1 });

    // Next card is UDP; rate "Mudah" -> grade 5.
    await screen.findByText('UDP');
    fireEvent.click(screen.getByRole('button', { name: /Balik kartu/ }));
    fireEvent.click(screen.getByRole('button', { name: /Mudah/ }));
    await waitFor(() => expect(mockRpc.getCalls('cards_review')).toHaveLength(2));
    expect(mockRpc.getLastCall('cards_review')?.payload).toMatchObject({ id: 2, grade: 5 });

    // TCP comes back (it was "Lagi"); "Baik" -> grade 4 finishes the session.
    await screen.findByText('TCP');
    fireEvent.click(screen.getByRole('button', { name: /Balik kartu/ }));
    fireEvent.click(screen.getByRole('button', { name: /Baik/ }));
    expect(await screen.findByRole('heading', { name: 'Review selesai' })).toBeTruthy();
    expect(mockRpc.getLastCall('cards_review')?.payload).toMatchObject({ id: 1, grade: 4 });
  });

  it('does not rate twice when a grade button is double-clicked', async () => {
    renderWithProviders(<FlashcardsView />, { route: '/kartu' });
    fireEvent.click(await screen.findByRole('button', { name: /Mulai review/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Balik kartu/ }));
    const good = screen.getByRole('button', { name: /Baik/ });
    fireEvent.click(good);
    fireEvent.click(good);
    await screen.findByText('UDP');
    expect(mockRpc.getCalls('cards_review')).toHaveLength(1);
  });

  it('shows an empty state (not zeros) when there are no cards', async () => {
    mockRpc.setResponse('cards_due', { cards: [], counts: { total: 0, due: 0, new: 0, learning: 0, mature: 0 } });
    renderWithProviders(<FlashcardsView />, { route: '/kartu' });
    expect(await screen.findByRole('heading', { name: 'Belum ada kartu' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mulai review/ })).toBeNull();
  });
});
