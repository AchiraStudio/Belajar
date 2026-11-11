import { rpcCall } from './rpc';

export interface JobInfo<TResult = unknown> {
  id: number;
  kind?: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress?: number;
  message?: string;
  error?: string | null;
  result?: TResult;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

/**
 * Polls `get_job` until it is `done` or `failed` (same cadence as the legacy client: 1.4 s, 3 s
 * back-off after a transient error). Resolves `null` if cancelled through `signal`.
 */
export async function pollJob<TResult = unknown>(
  jobId: number,
  opts: { signal?: AbortSignal; onUpdate?: (job: JobInfo<TResult>) => void } = {},
): Promise<JobInfo<TResult> | null> {
  for (;;) {
    await sleep(1400, opts.signal);
    if (opts.signal?.aborted) return null;
    let job: JobInfo<TResult>;
    try {
      job = await rpcCall<JobInfo<TResult>>('get_job', { id: jobId }, { bypassCache: true });
    } catch {
      await sleep(3000, opts.signal);
      continue;
    }
    opts.onUpdate?.(job);
    if (job.status === 'done' || job.status === 'failed') return job;
  }
}
