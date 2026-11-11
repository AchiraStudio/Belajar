import { useEffect, useRef, useState, useCallback } from 'react';
import { rpcCall } from '../../services/api/rpc';
import { apiUrl } from '../../services/api/client';
import type { StreakInfo, LogStudyResponse } from './types';

export function mmss(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function useStudyTimer(
  documentId: number,
  onStreakUpdate?: (streak: StreakInfo) => void
) {
  const [activeSeconds, setActiveSeconds] = useState(0);
  const lastActivityRef = useRef<number>(Date.now());
  const pendingRef = useRef<number>(0);
  const onStreakUpdateRef = useRef(onStreakUpdate);

  useEffect(() => {
    onStreakUpdateRef.current = onStreakUpdate;
  }, [onStreakUpdate]);

  const flush = useCallback(async () => {
    if (pendingRef.current <= 0 || !documentId) return;
    const sec = Math.min(pendingRef.current, 120);
    pendingRef.current -= sec;

    try {
      const res = await rpcCall<LogStudyResponse>('log_study', {
        document_id: documentId,
        seconds: sec,
      });
      if (res && res.streak && onStreakUpdateRef.current) {
        onStreakUpdateRef.current(res.streak);
      }
    } catch {
      // Re-accumulate unsaved seconds on error up to a safety ceiling
      pendingRef.current = Math.min(pendingRef.current + sec, 600);
    }
  }, [documentId]);

  useEffect(() => {
    if (!documentId) return;

    const bump = () => {
      lastActivityRef.current = Date.now();
    };

    const evs = ['pointermove', 'keydown', 'scroll', 'touchstart', 'click'] as const;
    evs.forEach((e) => {
      window.addEventListener(e, bump, { passive: true });
    });

    const timer = setInterval(() => {
      const isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
      const isRecent = Date.now() - lastActivityRef.current < 90_000;

      if (isVisible && isRecent) {
        setActiveSeconds((prev) => prev + 1);
        pendingRef.current += 1;

        if (pendingRef.current >= 30) {
          flush();
        }
      }
    }, 1000);

    const onHide = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && pendingRef.current > 0) {
        const sec = Math.min(pendingRef.current, 120);
        const payload = JSON.stringify({ document_id: documentId, seconds: sec });
        const targetUrl = apiUrl('/api/rpc/log_study');

        let sent = false;
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          try {
            const blob = new Blob([payload], { type: 'application/json' });
            sent = navigator.sendBeacon(targetUrl, blob);
          } catch {
            sent = false;
          }
        }

        if (sent) {
          pendingRef.current -= sec;
        } else if (typeof fetch !== 'undefined') {
          fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
          pendingRef.current -= sec;
        }
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onHide);
    }

    return () => {
      clearInterval(timer);
      evs.forEach((e) => window.removeEventListener(e, bump));
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onHide);
      }
      flush();
    };
  }, [documentId, flush]);

  return {
    activeSeconds,
    formattedTime: mmss(activeSeconds),
    flush,
  };
}
