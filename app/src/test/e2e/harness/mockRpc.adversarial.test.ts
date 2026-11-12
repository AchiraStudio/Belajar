import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockRpc } from './mockRpc';
import type { InterceptedCall } from './mockRpc';

describe('Adversarial Stress & Edge Case Suite for MockRpcDispatcher', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
  });

  afterEach(() => {
    mockRpc.uninstall();
  });

  // ==========================================================================
  // 1. Concurrency, Race Conditions & Telemetry Under Load
  // ==========================================================================
  describe('High Concurrency & Telemetry Stability', () => {
    it('handles 100 simultaneous requests across diverse actions without data loss or race conditions', async () => {
      const actions = [
        'dashboard',
        'list_subjects',
        'list_documents',
        'list_quizzes',
        'cards_due',
        'cards_stats',
        'play_hub',
        'play_map',
        'progress',
        'ping',
      ];

      const promises = Array.from({ length: 100 }, (_, i) => {
        const action = actions[i % actions.length];
        return fetch(`/api/rpc/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reqId: i }),
        }).then(async (res) => {
          expect(res.status).toBe(200);
          const data = await res.json();
          expect(data.ok).toBe(true);
          return { i, action, data };
        });
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);

      // Verify all 100 calls were accurately tracked in telemetry
      const allCalls = mockRpc.getCalls();
      expect(allCalls).toHaveLength(100);

      for (let i = 0; i < 100; i++) {
        expect(allCalls[i]?.payload).toEqual({ reqId: i });
      }
    });

    it('handles concurrent requests with interleaved artificial delays', async () => {
      mockRpc.setDelay('dashboard', 40);
      mockRpc.setDelay('ping', 10);
      mockRpc.setDelay('list_subjects', 20);

      const completionOrder: string[] = [];

      const pDashboard = fetch('/api/rpc/dashboard', { method: 'POST' }).then(() => {
        completionOrder.push('dashboard');
      });
      const pPing = fetch('/api/rpc/ping', { method: 'POST' }).then(() => {
        completionOrder.push('ping');
      });
      const pSubjects = fetch('/api/rpc/list_subjects', { method: 'POST' }).then(() => {
        completionOrder.push('list_subjects');
      });

      await Promise.all([pDashboard, pPing, pSubjects]);

      // Ping (10ms) should complete first, then list_subjects (20ms), then dashboard (40ms)
      expect(completionOrder).toEqual(['ping', 'list_subjects', 'dashboard']);

      // Calls array maintains invocation order
      const calls = mockRpc.getCalls();
      expect(calls.map((c) => c.action)).toEqual(['dashboard', 'ping', 'list_subjects']);
    });

    it('survives 500 rapid sequential requests and clears telemetry cleanly', async () => {
      for (let i = 0; i < 500; i++) {
        await fetch('/api/rpc/ping', {
          method: 'POST',
          body: JSON.stringify({ seq: i }),
        });
      }

      expect(mockRpc.getCalls('ping')).toHaveLength(500);

      mockRpc.clearCalls();
      expect(mockRpc.getCalls('ping')).toHaveLength(0);
      expect(mockRpc.getCalls()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 2. URL Variations & Parsing Edge Cases
  // ==========================================================================
  describe('URL Path Variations & Parsing', () => {
    it('handles query parameters on RPC actions (?foo=bar&baz=123)', async () => {
      const res = await fetch('/api/rpc/dashboard?filter=recent&limit=10', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      const call = mockRpc.getLastCall('dashboard');
      expect(call).toBeDefined();
      expect(call?.url).toBe('/api/rpc/dashboard?filter=recent&limit=10');
    });

    it('handles trailing slashes on RPC actions (/api/rpc/dashboard/)', async () => {
      const res = await fetch('/api/rpc/dashboard/', { method: 'POST' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      expect(mockRpc.getLastCall('dashboard')?.action).toBe('dashboard');
    });

    it('handles versioned and unversioned paths interchangeably', async () => {
      const resV0 = await fetch('/api/rpc/cards_due', { method: 'POST' });
      const resV1 = await fetch('/api/v1/rpc/cards_due', { method: 'POST' });

      expect(resV0.status).toBe(200);
      expect(resV1.status).toBe(200);

      const data0 = await resV0.json();
      const data1 = await resV1.json();
      expect(data0).toEqual(data1);

      expect(mockRpc.getCalls('cards_due')).toHaveLength(2);
    });

    it('handles absolute URLs with hostnames and ports', async () => {
      const res1 = await fetch('http://localhost:3000/api/rpc/dashboard', { method: 'POST' });
      const res2 = await fetch('http://127.0.0.1:8080/api/v1/rpc/dashboard', { method: 'POST' });
      const res3 = await fetch('https://custom-domain.com/api/rpc/dashboard', { method: 'POST' });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res3.status).toBe(200);

      expect(mockRpc.getCalls('dashboard')).toHaveLength(3);
    });

    it('returns 404 for unhandled paths and invalid versions', async () => {
      const res1 = await fetch('/api/v2/rpc/dashboard', { method: 'POST' });
      expect(res1.status).toBe(404);
      const data1 = await res1.json();
      expect(data1.error.code).toBe('not_found');

      const res2 = await fetch('/unknown/endpoint');
      expect(res2.status).toBe(404);

      const res3 = await fetch('/api/rpc/');
      expect(res3.status).toBe(404);
    });

    it('demonstrates unanchored RPC regex matching subpaths under actions', async () => {
      // Regex: /\/api\/(?:v1\/)?rpc\/([a-zA-Z0-9_]+)/
      // Because there is no trailing anchor, subpaths like /dashboard/extra match 'dashboard'
      const res = await fetch('/api/rpc/dashboard/extra_subpath', { method: 'POST' });
      expect(res.status).toBe(200);
      expect(mockRpc.getLastCall('dashboard')?.action).toBe('dashboard');
    });

    it('demonstrates trailing slash behavior on health endpoints', async () => {
      // /api/v1/health with trailing slash succeeds because /\/api\/v1\/health\/?$/ matches
      const res1 = await fetch('/api/v1/health/');
      expect(res1.status).toBe(200);

      // /health without trailing slash succeeds because path.endsWith('/health') matches
      const res2 = await fetch('/health');
      expect(res2.status).toBe(200);

      // /health/ with trailing slash fails with 404 because path.endsWith('/health') is false
      const res3 = await fetch('/health/');
      expect(res3.status).toBe(404);

      // Query params on health endpoint succeed
      const res4 = await fetch('/api/v1/health?check=deep');
      expect(res4.status).toBe(200);
    });

    it('demonstrates overbroad path.endsWith("/health") matching foreign endpoints', async () => {
      // Because path.endsWith('/health') is used without path anchoring:
      const foreignRes = await fetch('/third-party-service/health');
      expect(foreignRes.status).toBe(200);
      const data = await foreignRes.json();
      expect(data.service).toBe('stuby-server');
    });

    it('tests file upload endpoint variations (/api/upload, /api/v1/upload, with slashes)', async () => {
      const res1 = await fetch('/api/upload', { method: 'POST' });
      expect(res1.status).toBe(200);

      const res2 = await fetch('/api/v1/upload/', { method: 'POST' });
      expect(res2.status).toBe(200);

      expect(mockRpc.getCalls('upload')).toHaveLength(2);
    });
  });

  // ==========================================================================
  // 3. Error Injection & ADR-7 Formats
  // ==========================================================================
  describe('Error Injection & ADR-7 Compliance', () => {
    it('injects client errors (400, 401, 403, 404, 429) with retryable=false by default', async () => {
      const clientStatuses = [400, 401, 403, 404, 429];

      for (const status of clientStatuses) {
        mockRpc.setError('dashboard', {
          status,
          code: `client_err_${status}`,
          message: `Error status ${status}`,
        });

        const res = await fetch('/api/rpc/dashboard', { method: 'POST' });
        expect(res.status).toBe(status);

        const data = await res.json();
        expect(data.error).toEqual({
          code: `client_err_${status}`,
          message: `Error status ${status}`,
          retryable: false, // status < 500 defaults to false
        });
      }
    });

    it('injects server errors (500, 502, 503, 504) with retryable=true by default', async () => {
      const serverStatuses = [500, 502, 503, 504];

      for (const status of serverStatuses) {
        mockRpc.setError('dashboard', {
          status,
          code: `server_err_${status}`,
          message: `Error status ${status}`,
        });

        const res = await fetch('/api/rpc/dashboard', { method: 'POST' });
        expect(res.status).toBe(status);

        const data = await res.json();
        expect(data.error).toEqual({
          code: `server_err_${status}`,
          message: `Error status ${status}`,
          retryable: true, // status >= 500 defaults to true
        });
      }
    });

    it('honors explicit retryable overrides regardless of HTTP status', async () => {
      // 400 Bad Request but explicitly retryable
      mockRpc.setError('play_turn', {
        status: 400,
        code: 'rate_limited',
        message: 'Tunggu sebentar.',
        retryable: true,
      });

      const res1 = await fetch('/api/rpc/play_turn', { method: 'POST' });
      const data1 = await res1.json();
      expect(data1.error.retryable).toBe(true);

      // 500 Internal Error but explicitly non-retryable
      mockRpc.setError('play_turn', {
        status: 500,
        code: 'fatal_corrupt',
        message: 'Data rusak permanen.',
        retryable: false,
      });

      const res2 = await fetch('/api/rpc/play_turn', { method: 'POST' });
      const data2 = await res2.json();
      expect(data2.error.retryable).toBe(false);
    });

    it('supports legacy single-string error format when format="legacy"', async () => {
      mockRpc.setError('start_attempt', {
        status: 400,
        message: 'Legacy quiz error format',
        format: 'legacy',
      });

      const res = await fetch('/api/rpc/start_attempt', { method: 'POST' });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Legacy quiz error format' });
    });

    it('supports upload endpoint error injection', async () => {
      mockRpc.setError('upload', {
        status: 413,
        code: 'file_too_large',
        message: 'Ukuran file melebihi batas 20MB.',
        retryable: false,
      });

      const res = await fetch('/api/upload', { method: 'POST' });
      expect(res.status).toBe(413);

      const data = await res.json();
      expect(data.error.code).toBe('file_too_large');
      expect(data.error.message).toBe('Ukuran file melebihi batas 20MB.');
    });

    it('supports dynamic response callback throwing custom error', async () => {
      mockRpc.setResponse('ping', () => {
        throw new Error('Custom handler fault');
      });

      await expect(fetch('/api/rpc/ping', { method: 'POST' })).rejects.toThrow('Custom handler fault');
    });

    it('handles 204 No Content with Response.json limitation', async () => {
      // Testing Response.json with status 204 (HTTP spec prohibits body with 204)
      mockRpc.setError('delete_document', {
        status: 204,
      });

      // Response.json({ error: ... }, { status: 204 }) throws in standard Fetch API
      await expect(fetch('/api/rpc/delete_document', { method: 'POST' })).rejects.toThrow();
    });
  });

  // ==========================================================================
  // 4. Offline Toggling & State Restoration via reset()
  // ==========================================================================
  describe('Offline Simulation & State Restoration', () => {
    it('rejects all endpoints when offline is toggled on', async () => {
      mockRpc.setOffline(true);

      await expect(fetch('/api/v1/health')).rejects.toThrow('Failed to fetch');
      await expect(fetch('/api/upload', { method: 'POST' })).rejects.toThrow('Failed to fetch');
      await expect(fetch('/api/rpc/dashboard', { method: 'POST' })).rejects.toThrow('Failed to fetch');
      await expect(fetch('/api/unknown/endpoint')).rejects.toThrow('Failed to fetch');

      // Toggling offline off immediately restores connectivity
      mockRpc.setOffline(false);
      const res = await fetch('/api/v1/health');
      expect(res.status).toBe(200);
    });

    it('fully restores baseline state across all configurations on reset()', async () => {
      mockRpc.setOffline(true);
      mockRpc.setDelay('dashboard', 1000);
      mockRpc.setError('list_subjects', { status: 500, message: 'Server down' });
      mockRpc.setResponse('get_document', { fake: 'data' });
      mockRpc.setHealthDown('Offline maintenance');

      mockRpc.reset();

      // Offline cleared
      const resHealth = await fetch('/api/v1/health');
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json();
      expect(healthData.status).toBe('ok');

      // Errors cleared
      const resSubjects = await fetch('/api/rpc/list_subjects', { method: 'POST' });
      expect(resSubjects.status).toBe(200);

      // Custom response cleared
      const resDoc = await fetch('/api/rpc/get_document', { method: 'POST' });
      const docData = await resDoc.json();
      expect(docData.data.document.title).toBeDefined();

      // Calls reset
      expect(mockRpc.getCalls()).toHaveLength(3);
    });

    it('is idempotent on repeated install and uninstall calls', () => {
      mockRpc.install();
      mockRpc.install();

      mockRpc.uninstall();
      mockRpc.uninstall();

      mockRpc.install();
    });
  });

  // ==========================================================================
  // 5. Input Shapes: Request Objects, Non-JSON Body, AbortSignal
  // ==========================================================================
  describe('Input Shape & AbortSignal Vulnerability Analysis', () => {
    it('handles empty request bodies and non-JSON string payloads gracefully', async () => {
      const res1 = await fetch('/api/rpc/ping', { method: 'POST' });
      expect(res1.status).toBe(200);

      const res2 = await fetch('/api/rpc/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'just-plain-text-payload',
      });
      expect(res2.status).toBe(200);

      const call = mockRpc.getLastCall('ping');
      expect(call?.payload).toBe('just-plain-text-payload');
    });

    it('demonstrates vulnerability when fetch is passed a Request instance instead of string URL', async () => {
      // In JS fetch: fetch(new Request('http://localhost/api/rpc/dashboard', ...))
      const req = new Request('http://localhost/api/rpc/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testKey: 'val' }),
      });

      // MockRpcDispatcher does: urlStr = typeof input === 'string' ? input : input.toString();
      // Because input.toString() is "[object Request]", it produces:
      // http://localhost/[object%20Request], falling through to 404!
      const res = await fetch(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe('not_found');
      expect(data.error.message).toContain('[object%20Request]');
    });

    it('demonstrates vulnerability: AbortSignal is ignored during artificial delay', async () => {
      // MockRpcDispatcher line 325: await new Promise((resolve) => setTimeout(resolve, delayMs));
      // It does NOT listen to init?.signal
      mockRpc.setDelay('dashboard', 50);

      const controller = new AbortController();
      // Abort after 10ms
      setTimeout(() => controller.abort(), 10);

      const res = await fetch('/api/rpc/dashboard', {
        method: 'POST',
        signal: controller.signal,
      });

      // In a compliant fetch, this would reject with AbortError.
      // But MockRpcDispatcher ignores the signal and resolves with 200:
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('demonstrates hanging promise vulnerability on setHealth("loading")', async () => {
      // Line 274: if (this.healthState.status === 'loading') { await new Promise(() => {}); }
      // This promise never resolves or rejects.
      mockRpc.setHealth('loading');

      let resolved = false;
      void fetch('/api/v1/health').then(() => {
        resolved = true;
      });

      // Allow event loop ticks
      await new Promise((r) => setTimeout(r, 30));

      expect(resolved).toBe(false);
    });
  });
});
