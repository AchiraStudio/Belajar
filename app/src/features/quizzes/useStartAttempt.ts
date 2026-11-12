import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '../../components/ui';
import { errorMessage } from '../../hooks/useRpcQuery';
import { rpcCall } from '../../services/api/rpc';
import type { AttemptResponse } from './types';
import { tr } from '../../services/i18n';

/**
 * Starts a quiz attempt and opens the runner. `busy` holds the quiz id being started, so a
 * double-click cannot create two attempts.
 */
export function useStartAttempt() {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const start = useCallback(
    async (quizId: number, mode: 'practice' | 'exam', limitMinutes?: number) => {
      if (busy !== null) return;
      setBusy(quizId);
      try {
        const res = await rpcCall<AttemptResponse>('start_attempt', {
          quiz_id: quizId,
          mode,
          time_limit_min: limitMinutes,
          shuffle: mode === 'exam',
        });
        navigate(`/latihan/${res.attempt.id}`);
      } catch (err) {
        toast.error(errorMessage(err, tr('Gagal memulai kuis.')));
      } finally {
        setBusy(null);
      }
    },
    [busy, navigate, toast],
  );

  return { start, busy };
}
