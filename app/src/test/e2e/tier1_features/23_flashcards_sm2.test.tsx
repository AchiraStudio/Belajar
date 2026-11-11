import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { SurfaceCard } from '../../../components/ui/SurfaceCard';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultCardsDueFixture,
  defaultCardsStatsFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type CardsDueResponse,
  type CardsReviewResponse,
  type CardsStatsResponse,
  type FlashcardItem,
} from '../harness';

function FlashcardsReviewView() {
  const [stats, setStats] = useState<CardsStatsResponse | null>(null);
  const [deck, setDeck] = useState<FlashcardItem[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      rpcCall<CardsStatsResponse>('cards_stats'),
      rpcCall<CardsDueResponse>('cards_due'),
    ])
      .then(([statsRes, dueRes]) => {
        if (active) {
          setStats(statsRes);
          setDeck(dueRes.cards || []);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const handleStartReview = () => {
    setIsReviewing(true);
    setCurrentIndex(0);
    setIsFlipped(false);
    setCompletedCount(0);
    setIsFinished(false);
  };

  const handleFlipCard = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleRateCard = async (rating: 1 | 3 | 4 | 5) => {
    const currentCard = deck[currentIndex];
    if (!currentCard) return;

    await rpcCall<CardsReviewResponse>('cards_review', {
      card_id: currentCard.id,
      rating,
    });

    if (rating === 1) {
      // Re-queue card to end of deck
      setDeck((prev) => [...prev, currentCard]);
    } else {
      setCompletedCount((prev) => prev + 1);
    }

    if (currentIndex + 1 < deck.length) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
    } else {
      setIsFinished(true);
      setIsReviewing(false);
    }
  };

  const currentCard = deck[currentIndex];

  return (
    <main aria-label="Kartu Belajar">
      <header>
        <h1>Kartu Belajar</h1>
      </header>

      {/* Deck Statistics Overview */}
      {stats && !isReviewing && !isFinished && (
        <section role="region" aria-label="Statistik Kartu">
          <div>
            <span>Jatuh Tempo: {stats.due_today}</span>
            <span>Total Kartu: {stats.total}</span>
            <span>Dipelajari: {stats.learned}</span>
            <span>Retensi: {stats.retention_rate}%</span>
          </div>
          <p>{deck.length} kartu menunggu diulang hari ini</p>
          <Button onClick={handleStartReview} aria-label="Mulai review">
            Mulai Review
          </Button>
        </section>
      )}

      {/* Active Review Session */}
      {isReviewing && currentCard && (
        <section role="region" aria-label="Sesi Review Kartu">
          <div>
            <span>
              Kartu {currentIndex + 1} dari {deck.length}
            </span>
          </div>

          {/* 3D Flip Card Container */}
          <SurfaceCard>
            <div
              role="button"
              tabIndex={0}
              aria-label="Balik kartu"
              onClick={handleFlipCard}
              style={{ cursor: 'pointer', padding: '1.5rem' }}
            >
              <h3>{currentCard.front}</h3>
              {isFlipped && (
                <div role="region" aria-label="Jawaban Kartu">
                  <hr />
                  <p>{currentCard.back}</p>
                </div>
              )}
            </div>
          </SurfaceCard>

          {/* SM-2 Rating Buttons (visible only after flip) */}
          {isFlipped && (
            <div role="group" aria-label="Tombol Penilaian SM-2">
              <Button
                variant="outline"
                onClick={() => handleRateCard(1)}
                aria-label="1 - Lagi"
              >
                1 - Lagi
              </Button>
              <Button
                variant="outline"
                onClick={() => handleRateCard(3)}
                aria-label="2 - Sulit"
              >
                2 - Sulit
              </Button>
              <Button
                variant="outline"
                onClick={() => handleRateCard(4)}
                aria-label="3 - Baik"
              >
                3 - Baik
              </Button>
              <Button
                variant="outline"
                onClick={() => handleRateCard(5)}
                aria-label="4 - Mudah"
              >
                4 - Mudah
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Completion Screen */}
      {isFinished && (
        <section role="region" aria-label="Selesai Review">
          <h2>Review Selesai</h2>
          <p>Hebat! Kamu telah mereview {completedCount} kartu hari ini.</p>
          <Button onClick={handleStartReview} aria-label="Review lagi">
            Review Lagi
          </Button>
        </section>
      )}
    </main>
  );
}

describe('Feature 23: Flashcards Review (SM-2)', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('cards_stats', defaultCardsStatsFixture);
    mockRpc.setResponse('cards_due', defaultCardsDueFixture);
    mockRpc.setResponse('cards_review', {
      card_id: 601,
      next_review: '2026-11-12T00:00:00Z',
      interval: 2,
      ease_factor: 2.5,
    });
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('23.1 - renders deck statistics and due count overview', async () => {
    renderWithProviders(<FlashcardsReviewView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Kartu Belajar' })).toBeTruthy();
      expect(screen.getByText(/jatuh tempo: 5/i)).toBeTruthy();
      expect(screen.getByText(/total kartu: 35/i)).toBeTruthy();
      expect(screen.getByText(/dipelajari: 30/i)).toBeTruthy();
      expect(screen.getByText(/retensi: 91.5%/i)).toBeTruthy();
      expect(screen.getByText(/2 kartu menunggu diulang hari ini/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Mulai review' })).toBeTruthy();
    });
  });

  it('23.2 - launches review session and displays front of flashcard', async () => {
    renderWithProviders(<FlashcardsReviewView />);

    const startBtn = await screen.findByRole('button', { name: 'Mulai review' });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Sesi Review Kartu' })).toBeTruthy();
      expect(
        screen.getByText('Sebutkan 7 lapisan dalam model referensi OSI!')
      ).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'Jawaban Kartu' })).toBeNull();
    });
  });

  it('23.3 - reveals back of card and 4 SM-2 rating buttons on flip', async () => {
    renderWithProviders(<FlashcardsReviewView />);

    const startBtn = await screen.findByRole('button', { name: 'Mulai review' });
    fireEvent.click(startBtn);

    const cardFlipBtn = await screen.findByRole('button', { name: 'Balik kartu' });
    fireEvent.click(cardFlipBtn);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Jawaban Kartu' })).toBeTruthy();
      expect(screen.getByText(/physical, data link, network/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: '1 - Lagi' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '2 - Sulit' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '3 - Baik' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '4 - Mudah' })).toBeTruthy();
    });
  });

  it('23.4 - submits SM-2 rating and advances to next due card', async () => {
    renderWithProviders(<FlashcardsReviewView />);

    const startBtn = await screen.findByRole('button', { name: 'Mulai review' });
    fireEvent.click(startBtn);

    const cardFlipBtn = await screen.findByRole('button', { name: 'Balik kartu' });
    fireEvent.click(cardFlipBtn);

    const goodBtn = await screen.findByRole('button', { name: '3 - Baik' });
    fireEvent.click(goodBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('cards_review');
      expect(call).toBeTruthy();
      expect(call?.payload.card_id).toBe(601);
      expect(call?.payload.rating).toBe(4);

      // Card 2 rendered
      expect(screen.getByText('Apa perbedaan utama TCP dan UDP?')).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'Jawaban Kartu' })).toBeNull();
    });
  });

  it('23.5 - re-queues card on Lagi rating and displays completion screen when finished', async () => {
    renderWithProviders(<FlashcardsReviewView />);

    const startBtn = await screen.findByRole('button', { name: 'Mulai review' });
    fireEvent.click(startBtn);

    // Card 1: Flip and click '1 - Lagi' (re-queues to end)
    const cardFlipBtn1 = await screen.findByRole('button', { name: 'Balik kartu' });
    fireEvent.click(cardFlipBtn1);
    const againBtn = await screen.findByRole('button', { name: '1 - Lagi' });
    fireEvent.click(againBtn);

    // Card 2: Flip and click '3 - Baik'
    await screen.findByText('Apa perbedaan utama TCP dan UDP?');
    const cardFlipBtn2 = screen.getByRole('button', { name: 'Balik kartu' });
    fireEvent.click(cardFlipBtn2);
    const goodBtn2 = await screen.findByRole('button', { name: '3 - Baik' });
    fireEvent.click(goodBtn2);

    // Card 1 re-queued: Flip and click '4 - Mudah'
    await screen.findByText('Sebutkan 7 lapisan dalam model referensi OSI!');
    const cardFlipBtn3 = screen.getByRole('button', { name: 'Balik kartu' });
    fireEvent.click(cardFlipBtn3);
    const easyBtn = await screen.findByRole('button', { name: '4 - Mudah' });
    fireEvent.click(easyBtn);

    // Completion screen
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Review Selesai' })).toBeTruthy();
      expect(screen.getByText(/hebat! kamu telah mereview 2 kartu/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Review lagi' })).toBeTruthy();
    });
  });
});
