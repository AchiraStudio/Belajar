import type { MindNode } from './types';

export type Measure = (text: string, size: number, weight: number) => number;

export interface LayoutNode {
  n: MindNode;
  depth: number;
  /** 1 = right of the root, -1 = left, 0 = the root itself. */
  side: -1 | 0 | 1;
  /** Branch colour index; -1 for the root. */
  branch: number;
  parent: LayoutNode | null;
  lines: string[];
  size: number;
  weight: number;
  lh: number;
  w: number;
  hgt: number;
  kids: LayoutNode[];
  hasKids: boolean;
  x: number;
  y: number;
  cy: number;
  bh: number;
}

export interface Layout {
  nodes: LayoutNode[];
  byId: Map<string, LayoutNode>;
  root: LayoutNode;
  bbox: { x: number; y: number; w: number; h: number };
}

export const BRANCH_COLORS = 8;

const STYLE = [
  { size: 17, weight: 750, maxW: 190, px: 20, py: 13 }, // root
  { size: 15, weight: 650, maxW: 210, px: 15, py: 9 }, // main branches
  { size: 13.5, weight: 550, maxW: 220, px: 12, py: 7 }, // level 2+
] as const;
const HGAP = 56;
const VGAP = 12;

/** Deterministic text-width estimate used when no canvas is available (SSR, tests). */
export const estimateWidth: Measure = (text, size) => text.length * size * 0.56;

let canvasCtx: CanvasRenderingContext2D | null | undefined;
export const canvasMeasure: Measure = (text, size, weight) => {
  if (canvasCtx === undefined) {
    try {
      canvasCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      canvasCtx = null;
    }
  }
  if (canvasCtx) {
    canvasCtx.font = `${weight} ${size}px Bricolage, system-ui, sans-serif`;
    const w = canvasCtx.measureText(text).width;
    if (w > 0) return w;
  }
  return estimateWidth(text, size, weight);
};

export function wrapLabel(text: string, maxW: number, size: number, weight: number, measure: Measure): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next, size, weight) > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  const out: string[] = [];
  for (const l of lines) {
    let rest = l;
    while (measure(rest, size, weight) > maxW * 1.15 && rest.length > 8) {
      let cut = rest.length - 1;
      while (cut > 4 && measure(rest.slice(0, cut), size, weight) > maxW) cut--;
      out.push(`${rest.slice(0, cut)}‑`);
      rest = rest.slice(cut);
    }
    out.push(rest);
  }
  return out.slice(0, 4);
}

/**
 * Two-sided tree layout (root in the centre). The first branch always goes right; the split point
 * is chosen to balance the weight (leaf count) of both sides. Collapsed nodes hide their children.
 */
export function buildLayout(root: MindNode, collapsed: ReadonlySet<string>, measure: Measure = canvasMeasure): Layout {
  const byId = new Map<string, LayoutNode>();
  const kidsOf = (n: MindNode): MindNode[] => (collapsed.has(n.id) ? [] : (n.children ?? []));
  const weightOf = (n: MindNode): number => {
    const k = kidsOf(n);
    return k.length ? k.reduce((a, c) => a + weightOf(c), 0) : 1;
  };

  function make(n: MindNode, depth: number, side: -1 | 0 | 1, branch: number, parent: LayoutNode | null): LayoutNode {
    const st = STYLE[Math.min(depth, 2)] as (typeof STYLE)[number];
    const lines = wrapLabel(n.label, st.maxW, st.size, st.weight, measure);
    const lh = st.size * 1.3;
    const textW = Math.max(0, ...lines.map((l) => measure(l, st.size, st.weight)));
    const o: LayoutNode = {
      n,
      depth,
      side,
      branch,
      parent,
      lines,
      size: st.size,
      weight: st.weight,
      lh,
      w: Math.max(textW + st.px * 2, depth === 0 ? 120 : 64),
      hgt: lines.length * lh + st.py * 2,
      kids: [],
      hasKids: depth === 0 ? true : Boolean(n.children && n.children.length),
      x: 0,
      y: 0,
      cy: 0,
      bh: 0,
    };
    byId.set(n.id, o);
    if (depth > 0) for (const c of kidsOf(n)) o.kids.push(make(c, depth + 1, side, branch, o));
    return o;
  }

  const rootO = make(root, 0, 0, -1, null);
  const l1 = root.children ?? [];
  const total = l1.reduce((a, c) => a + weightOf(c), 0);
  let split = 1;
  let best = Infinity;
  let acc = 0;
  for (let i = 1; i <= l1.length; i++) {
    acc += weightOf(l1[i - 1] as MindNode);
    const diff = Math.abs(2 * acc - total);
    if (diff < best) {
      best = diff;
      split = i;
    }
  }
  const right = l1.slice(0, split).map((c, i) => make(c, 1, 1, i % BRANCH_COLORS, rootO));
  const left = l1.slice(split).map((c, i) => make(c, 1, -1, (split + i) % BRANCH_COLORS, rootO));
  rootO.kids = [...right, ...left];

  const place = (o: LayoutNode, top: number): number => {
    if (!o.kids.length) {
      o.bh = o.hgt + VGAP;
      o.cy = top + o.bh / 2;
      return o.bh;
    }
    let y = top;
    for (const k of o.kids) y += place(k, y);
    const used = y - top;
    o.bh = Math.max(used, o.hgt + VGAP);
    if (o.bh > used) shiftY(o.kids, (o.bh - used) / 2);
    o.cy = ((o.kids[0] as LayoutNode).cy + (o.kids[o.kids.length - 1] as LayoutNode).cy) / 2;
    return o.bh;
  };
  const shiftY = (list: LayoutNode[], dy: number) => {
    for (const o of list) {
      o.cy += dy;
      shiftY(o.kids, dy);
    }
  };
  const flatten = (list: LayoutNode[], out: LayoutNode[] = []): LayoutNode[] => {
    for (const o of list) {
      out.push(o);
      flatten(o.kids, out);
    }
    return out;
  };

  for (const [list, sign] of [
    [right, 1],
    [left, -1],
  ] as const) {
    if (!list.length) continue;
    let y = 0;
    for (const o of list) y += place(o, y);
    shiftY(list, -y / 2);
    const nodes = flatten(list);
    const colW: number[] = [];
    for (const o of nodes) colW[o.depth] = Math.max(colW[o.depth] ?? 0, o.w);
    const xs: number[] = [];
    let x = rootO.w / 2 + HGAP;
    for (let d = 1; d < colW.length; d++) {
      xs[d] = x;
      x += (colW[d] ?? 0) + HGAP;
    }
    for (const o of nodes) o.x = sign === 1 ? (xs[o.depth] ?? 0) : -(xs[o.depth] ?? 0) - o.w;
  }
  rootO.x = -rootO.w / 2;
  rootO.cy = 0;
  const nodes = [rootO, ...flatten(rootO.kids)];
  for (const o of nodes) o.y = o.cy - o.hgt / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of nodes) {
    minX = Math.min(minX, o.x - 50);
    maxX = Math.max(maxX, o.x + o.w + 50);
    minY = Math.min(minY, o.y);
    maxY = Math.max(maxY, o.y + o.hgt);
  }
  return { nodes, byId, root: rootO, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

export function countNodes(n: MindNode): number {
  return 1 + (n.children ?? []).reduce((a, c) => a + countNodes(c), 0);
}

export function findPath(root: MindNode, id: string, trail: MindNode[] = []): MindNode[] | null {
  const t = [...trail, root];
  if (root.id === id) return t;
  for (const c of root.children ?? []) {
    const r = findPath(c, id, t);
    if (r) return r;
  }
  return null;
}

/** Large maps start with everything below level 1 folded, so the first view stays readable. */
export function defaultCollapsed(root: MindNode): Set<string> {
  const out = new Set<string>();
  if (countNodes(root) <= 40) return out;
  const walk = (n: MindNode, depth: number) => {
    if (depth >= 2 && n.children?.length) out.add(n.id);
    for (const c of n.children ?? []) walk(c, depth + 1);
  };
  walk(root, 1);
  return out;
}
