export interface MindNode {
  id: string;
  label: string;
  children?: MindNode[];
}

export interface MindRelation {
  from: string;
  to: string;
  label?: string;
}

export interface MindMapData {
  root: MindNode;
  relations: MindRelation[];
  node_count: number;
  updated_at: number;
  /** The notes changed after this map was generated. */
  stale: boolean;
}

export interface MindJob {
  id: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress?: number;
  message?: string;
  error?: string | null;
}

export interface MindMapResponse {
  mindmap: MindMapData | null;
  job: MindJob | null;
}
