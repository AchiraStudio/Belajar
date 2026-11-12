/**
 * Development only (`npm run dev:mock`). Answers the app's API calls in the browser with the same
 * realistic fixtures the tests use, so the whole UI can be tried and restyled instantly: no database,
 * no server, no build. It is loaded from `main.tsx` behind `import.meta.env.MODE === 'mock'`, so
 * production bundles never contain it.
 *
 * Data is read-only fiction: saving a setting "succeeds" but nothing is stored, and pages whose
 * fixtures are not listed here show their normal empty or error state.
 */
import {
  defaultCardsDueFixture,
  defaultCardsStatsFixture,
  defaultDashboardFixture,
  defaultDocumentDetailFixture,
  defaultDocumentsFixture,
  defaultGetSettingsFixture,
  defaultHealthFixture,
  defaultLlmCheckFixture,
  defaultPingFixture,
  defaultPlayHubFixture,
  defaultPlayMapFixture,
  defaultProgressFixture,
  defaultQuizzesFixture,
  defaultSubjectsFixture,
} from '../test/e2e/harness/fixtures';

const RPC: Record<string, unknown> = {
  dashboard: defaultDashboardFixture,
  get_settings: defaultGetSettingsFixture,
  list_subjects: defaultSubjectsFixture,
  list_documents: defaultDocumentsFixture,
  get_document: defaultDocumentDetailFixture,
  list_quizzes: defaultQuizzesFixture,
  progress: defaultProgressFixture,
  cards_stats: defaultCardsStatsFixture,
  cards_due: defaultCardsDueFixture,
  play_hub: defaultPlayHubFixture,
  play_map: defaultPlayMapFixture,
  llm_check: defaultLlmCheckFixture,
  ping: defaultPingFixture,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function installMockApi(): void {
  const realFetch = window.fetch.bind(window);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
    const { pathname } = url;
    if (!pathname.startsWith('/api')) return realFetch(input, init);

    await new Promise((r) => setTimeout(r, 120)); // a little latency, so loading states are visible

    if (pathname === '/api/session') return json({ authenticated: true });
    if (pathname === '/api/login' || pathname === '/api/logout') return json({ ok: true });
    if (pathname === '/api/v1/health' || pathname === '/api/health') return json(defaultHealthFixture);

    const rpc = /^\/api\/rpc\/([\w-]+)/.exec(pathname);
    if (rpc) {
      const action = rpc[1]!;
      return json({ ok: true, data: RPC[action] ?? {} });
    }

    return json({ error: { code: 'not_found', message: 'Not part of the development mock.' } }, 404);
  }) as typeof window.fetch;

  console.info('[stuby] Mock API active: data is fictional and nothing is saved.');
}
