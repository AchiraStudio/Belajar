export interface MathToken {
  tex: string;
  display: boolean;
  lit?: string;
}

export interface TocItem {
  id: string;
  text: string;
  level?: number;
}

export interface DocumentNote {
  id?: number;
  document_id?: number;
  content_md: string;
  edited?: number; // 0 = original, 1 = edited
  updated_at?: string;
}

export interface TanyaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export interface SelectionCoords {
  top: number;
  left: number;
  text: string;
}
