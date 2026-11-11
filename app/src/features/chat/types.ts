export interface ChatMessage {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  ts?: number;
  /** Client-only flags while a reply is being streamed. */
  pending?: boolean;
  interrupted?: boolean;
}

export interface ChatSession {
  id: number;
  status: 'preparing' | 'ready' | 'error' | string;
}

export interface ChatStartResponse {
  session: ChatSession;
  document?: { id: number; title: string };
  messages: ChatMessage[];
  /** `new` = a fresh session was created; `continue` = an existing one was resumed. */
  mode?: 'new' | 'continue';
}
