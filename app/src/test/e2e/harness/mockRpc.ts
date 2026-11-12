import { vi } from 'vitest';
import { dropCache } from '../../../services/api/rpc';
import type {
  Adr7Error,
  StubyRpcActionName,
  HealthResponse,
  UploadResponse,
} from './contracts';
import {
  defaultHealthFixture,
  defaultUploadFixture,
  defaultDashboardFixture,
  defaultSubjectsFixture,
  defaultDocumentsFixture,
  defaultDocumentDetailFixture,
  defaultQuizzesFixture,
  defaultPracticeAttemptFixture,
  defaultExamAttemptFixture,
  defaultReviewAttemptFixture,
  defaultGetAttemptFixture,
  defaultCheckAnswerFixture,
  defaultFinishAttemptFixture,
  defaultExplainQuestionFixture,
  defaultCardsDueFixture,
  defaultCardsStatsFixture,
  defaultCardsExportFixture,
  defaultPlayHubFixture,
  defaultPlayMapFixture,
  defaultPlayTurnFixture,
  defaultPlayGetFixture,
  defaultPlayFinishFixture,
  defaultProgressFixture,
  defaultGetSettingsFixture,
  defaultLlmCheckFixture,
  defaultGetJobFixture,
  defaultPingFixture,
  defaultNotesAskFixture,
  defaultMindMapFixture,
  defaultChatStartFixture,
  defaultChatSendFixture,
} from './fixtures';

export interface MockErrorOptions {
  code?: string;
  message?: string;
  retryable?: boolean;
  status?: number;
  format?: 'adr7' | 'legacy';
}

export interface InterceptedCall {
  action: string;
  url: string;
  method: string;
  payload: any;
  timestamp: number;
}

export type HealthStatus = 'ok' | 'down' | 'loading';

/**
 * MockRpcDispatcher: Intercepts global `fetch` calls in JSDOM / Vitest tests.
 * Intercepts `/api/v1/health`, `/api/v1/rpc/:action`, `/api/rpc/:action`, and `/api/upload`.
 * Provides honest state controls: setOffline, setDelay, setError, setResponse, etc.
 */
export class MockRpcDispatcher {
  private isOffline: boolean = false;
  private delays: Map<string, number> = new Map();
  private errors: Map<string, MockErrorOptions> = new Map();
  private responses: Map<string, any> = new Map();
  private healthState: {
    status: HealthStatus;
    version: string;
    error?: MockErrorOptions;
  } = {
    status: 'ok',
    version: '0.1.0',
  };
  private calls: InterceptedCall[] = [];
  private installed: boolean = false;
  private originalFetch: typeof globalThis.fetch | null = null;

  /**
   * Set offline mode. When true, fetch rejects with `TypeError('Failed to fetch')`.
   */
  public setOffline(offline: boolean = true): this {
    this.isOffline = offline;
    return this;
  }

  /**
   * Set artificial delay for an action in milliseconds.
   */
  public setDelay(action: string, ms: number): this {
    this.delays.set(action, ms);
    return this;
  }

  /**
   * Clear delay for an action.
   */
  public clearDelay(action: string): this {
    this.delays.delete(action);
    return this;
  }

  /**
   * Force an action to return an HTTP error (ADR-7 format by default).
   */
  public setError(action: string, error: MockErrorOptions): this {
    this.errors.set(action, error);
    return this;
  }

  /**
   * Clear forced error for an action.
   */
  public clearError(action: string): this {
    this.errors.delete(action);
    return this;
  }

  /**
   * Override success response data for an action.
   * If data contains an `ok` property, it is returned directly;
   * otherwise it is wrapped in `{ ok: true, data }`.
   */
  public setResponse<T = any>(action: string, data: T | ((payload: any) => T)): this {
    this.responses.set(action, data);
    return this;
  }

  /**
   * Clear response override for an action.
   */
  public clearResponse(action: string): this {
    this.responses.delete(action);
    return this;
  }

  /**
   * Set health endpoint status.
   */
  public setHealth(status: HealthStatus, version: string = '0.1.0', error?: MockErrorOptions): this {
    this.healthState = { status, version, error };
    return this;
  }

  /**
   * Shortcut to simulate health down (503 Service Unavailable).
   */
  public setHealthDown(message: string = 'Server tidak terjangkau.'): this {
    this.healthState = {
      status: 'down',
      version: '0.1.0',
      error: { status: 503, code: 'service_unavailable', message, retryable: true },
    };
    return this;
  }

  /**
   * Shortcut to restore healthy status.
   */
  public setHealthOk(version: string = '0.1.0'): this {
    this.healthState = { status: 'ok', version };
    return this;
  }

  /**
   * Return recorded calls for all actions or a specific action.
   */
  public getCalls(action?: string): InterceptedCall[] {
    if (!action) return [...this.calls];
    return this.calls.filter((c) => c.action === action);
  }

  /**
   * Return the most recent call for an action (or overall).
   */
  public getLastCall(action?: string): InterceptedCall | undefined {
    const list = this.getCalls(action);
    return list[list.length - 1];
  }

  /**
   * Clear call history.
   */
  public clearCalls(): void {
    this.calls.length = 0;
  }

  /**
   * Reset all mock overrides, delays, offline status, and call history.
   */
  public reset(): void {
    dropCache();
    this.isOffline = false;
    this.delays.clear();
    this.errors.clear();
    this.responses.clear();
    this.calls.length = 0;
    this.healthState = { status: 'ok', version: '0.1.0' };
  }

  /**
   * Activates global fetch interception. Call in beforeEach() or setup.
   */
  public install(): void {
    if (this.installed) return;
    if (typeof globalThis.fetch === 'function') {
      this.originalFetch = globalThis.fetch;
    }
    vi.stubGlobal('fetch', vi.fn(this.handleFetch.bind(this)));
    this.installed = true;
  }

  /**
   * Restores original global fetch. Call in afterEach() or teardown.
   */
  public uninstall(): void {
    if (!this.installed) return;
    vi.unstubAllGlobals();
    this.installed = false;
    this.originalFetch = null;
  }

  /**
   * Core request dispatcher.
   */
  private async handleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // 1. Offline network disconnection simulation
    if (this.isOffline) {
      throw new TypeError('Failed to fetch');
    }

    const urlStr = typeof input === 'string' ? input : input.toString();
    const parsedUrl = new URL(urlStr, 'http://localhost');
    const path = parsedUrl.pathname;
    const method = init?.method ?? 'GET';

    let body: any = {};
    if (init?.body) {
      if (typeof init.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      } else {
        body = init.body;
      }
    }

    // 2. Health Endpoint: GET /api/v1/health or /health
    if (/\/api\/v1\/health\/?$/.test(path) || path.endsWith('/health')) {
      this.calls.push({ action: 'health', url: urlStr, method, payload: body, timestamp: Date.now() });

      if (this.healthState.status === 'down') {
        const err = this.healthState.error ?? {
          status: 503,
          code: 'service_unavailable',
          message: 'Server tidak terjangkau.',
          retryable: true,
        };
        const status = err.status ?? 503;
        return Response.json(
          {
            error: {
              code: err.code ?? 'service_unavailable',
              message: err.message ?? 'Server tidak terjangkau.',
              retryable: err.retryable ?? true,
            },
          },
          { status }
        );
      }

      if (this.healthState.status === 'loading') {
        // Simulates pending request that does not resolve in this tick
        await new Promise(() => {});
      }

      const customHealth = this.responses.get('health');
      if (customHealth) {
        return Response.json(typeof customHealth === 'function' ? customHealth(body) : customHealth);
      }

      const res: HealthResponse = {
        ...defaultHealthFixture,
        version: this.healthState.version,
      };
      return Response.json(res);
    }

    // 3. File Upload Endpoint: POST /api/upload or POST /api/v1/upload
    if (/\/api\/(?:v1\/)?upload\/?$/.test(path)) {
      this.calls.push({ action: 'upload', url: urlStr, method, payload: body, timestamp: Date.now() });

      const err = this.errors.get('upload');
      if (err) {
        const status = err.status ?? 400;
        return Response.json(
          {
            error: {
              code: err.code ?? 'upload_error',
              message: err.message ?? 'Gagal mengunggah file.',
              retryable: err.retryable ?? false,
            },
          },
          { status }
        );
      }

      const customUpload = this.responses.get('upload');
      if (customUpload) {
        return Response.json(typeof customUpload === 'function' ? customUpload(body) : customUpload);
      }

      return Response.json(defaultUploadFixture);
    }

    // 4. RPC Dispatcher: /api/rpc/:action or /api/v1/rpc/:action
    const rpcMatch = path.match(/\/api\/(?:v1\/)?rpc\/([a-zA-Z0-9_]+)/);
    if (rpcMatch && rpcMatch[1]) {
      const action = rpcMatch[1];
      this.calls.push({ action, url: urlStr, method, payload: body, timestamp: Date.now() });

      // Artificial Delay
      const delayMs = this.delays.get(action);
      if (delayMs && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // Simulated Error
      const forcedError = this.errors.get(action);
      if (forcedError) {
        const status = forcedError.status ?? 400;
        const msg = forcedError.message ?? 'Terjadi kesalahan pada permintaan.';
        if (forcedError.format === 'legacy') {
          return Response.json({ error: msg }, { status });
        }
        return Response.json(
          {
            error: {
              code: forcedError.code ?? 'bad_request',
              message: msg,
              retryable: forcedError.retryable ?? status >= 500,
            },
          },
          { status }
        );
      }

      // Custom Response Override
      const customResponse = this.responses.get(action);
      if (customResponse !== undefined) {
        const resolvedData = typeof customResponse === 'function' ? await customResponse(body) : customResponse;
        if (resolvedData && typeof resolvedData === 'object' && 'ok' in resolvedData) {
          return Response.json(resolvedData);
        }
        return Response.json({ ok: true, data: resolvedData });
      }

      // Default Fixture Dispatcher for all 38 Actions
      const defaultData = this.getDefaultActionData(action as StubyRpcActionName, body);
      return Response.json({ ok: true, data: defaultData });
    }

    // 5. Fallback 404 for unhandled endpoints
    return Response.json(
      {
        error: {
          code: 'not_found',
          message: `Endpoint ${path} tidak ditemukan pada mock server`,
          retryable: false,
        },
      },
      { status: 404 }
    );
  }

  /**
   * Returns default realistic fixture data for any Stuby RPC action.
   */
  private getDefaultActionData(action: StubyRpcActionName | string, payload: any): any {
    switch (action) {
      case 'dashboard':
        return defaultDashboardFixture;
      case 'list_subjects':
        return defaultSubjectsFixture;
      case 'create_subject':
        return {
          subject: {
            id: Date.now(),
            name: payload?.name || 'Subjek Baru',
            color: payload?.color || '#6558E8',
            doc_count: 0,
          },
        };
      case 'delete_subject':
        return {};
      case 'list_documents':
        if (payload?.subject_id) {
          return {
            documents: defaultDocumentsFixture.documents.filter((d) => d.subject_id === payload.subject_id),
          };
        }
        return defaultDocumentsFixture;
      case 'get_document':
        return defaultDocumentDetailFixture;
      case 'update_document':
        return {};
      case 'delete_document':
        return {};
      case 'reprocess_document':
        return { job_id: 801 };
      case 'save_note':
        return {};
      case 'notes_ask':
        return defaultNotesAskFixture;
      case 'notes_ask_delete':
        return { ok: true };
      case 'mindmap_get':
        return defaultMindMapFixture;
      case 'chat_start':
      case 'chat_get':
        return defaultChatStartFixture;
      case 'chat_send':
        return defaultChatSendFixture;
      case 'chat_delete':
        return { ok: true };
      case 'log_study':
        return { streak: defaultDashboardFixture.streak };
      case 'list_quizzes':
        return defaultQuizzesFixture;
      case 'generate_quiz':
        return { quiz_id: 303, job_id: 803 };
      case 'delete_quiz':
        return {};
      case 'start_attempt':
        if (payload?.mode === 'exam') {
          return defaultExamAttemptFixture;
        }
        return defaultPracticeAttemptFixture;
      case 'start_review':
        return defaultReviewAttemptFixture;
      case 'get_attempt':
        return defaultGetAttemptFixture;
      case 'check_answer':
        return defaultCheckAnswerFixture;
      case 'finish_attempt':
        return defaultFinishAttemptFixture;
      case 'explain_question':
        return defaultExplainQuestionFixture;
      case 'cards_due':
        return defaultCardsDueFixture;
      case 'cards_review':
        return {
          card_id: payload?.card_id || 601,
          next_review: '2026-11-12T00:00:00Z',
          interval: 2,
          ease_factor: 2.5,
        };
      case 'cards_build':
        return { created: 4, updated: 2 };
      case 'cards_stats':
        return defaultCardsStatsFixture;
      case 'cards_export':
        return defaultCardsExportFixture;
      case 'play_hub':
        return defaultPlayHubFixture;
      case 'play_map':
        return defaultPlayMapFixture;
      case 'play_turn':
        return defaultPlayTurnFixture;
      case 'play_get':
        return defaultPlayGetFixture;
      case 'play_finish':
        return defaultPlayFinishFixture;
      case 'play_abandon':
        return { ok: true };
      case 'play_flag':
        return { ok: true };
      case 'progress':
        return defaultProgressFixture;
      case 'get_settings':
        return defaultGetSettingsFixture;
      case 'save_settings':
        return { settings: payload?.settings || {} };
      case 'llm_check':
        return defaultLlmCheckFixture;
      case 'get_job':
        return defaultGetJobFixture;
      case 'ping':
        return defaultPingFixture;
      default:
        return {};
    }
  }
}

/**
 * Singleton mockRpc instance for convenient usage across test suites.
 */
export const mockRpc = new MockRpcDispatcher();
