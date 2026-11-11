import { describe, expect, it } from 'vitest';
import { buildLayout, countNodes, defaultCollapsed, estimateWidth, findPath, wrapLabel } from './layout';
import type { MindNode } from './types';

const tree: MindNode = {
  id: 'n0',
  label: 'Fotosintesis',
  children: [
    { id: 'n1', label: 'Reaksi terang', children: [{ id: 'n2', label: 'Tilakoid' }, { id: 'n3', label: 'ATP' }] },
    { id: 'n4', label: 'Siklus Calvin', children: [{ id: 'n5', label: 'Stroma' }] },
    { id: 'n6', label: 'Faktor', children: [] },
  ],
};

describe('mind map layout', () => {
  it('places the root in the centre and branches on both sides', () => {
    const l = buildLayout(tree, new Set(), estimateWidth);
    expect(l.root.cy).toBe(0);
    const sides = new Set(l.nodes.filter((n) => n.depth === 1).map((n) => n.side));
    expect(sides.has(1)).toBe(true);
    expect(l.byId.size).toBe(countNodes(tree));
    for (const n of l.nodes.filter((x) => x.side === 1)) expect(n.x).toBeGreaterThan(l.root.x);
    for (const n of l.nodes.filter((x) => x.side === -1)) expect(n.x + n.w).toBeLessThan(l.root.x + l.root.w);
  });

  it('hides the children of collapsed nodes', () => {
    const open = buildLayout(tree, new Set(), estimateWidth);
    const folded = buildLayout(tree, new Set(['n1']), estimateWidth);
    expect(folded.nodes.length).toBe(open.nodes.length - 2);
    expect(folded.byId.get('n1')?.hasKids).toBe(true);
  });

  it('never overlaps siblings vertically', () => {
    const l = buildLayout(tree, new Set(), estimateWidth);
    for (const parent of l.nodes) {
      // The root has one column of children on each side; siblings are compared per side.
      for (const side of [1, -1] as const) {
        const sorted = parent.kids.filter((k) => k.side === side).sort((a, b) => a.y - b.y);
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1]!;
          expect(sorted[i]!.y).toBeGreaterThanOrEqual(prev.y + prev.hgt - 0.001);
        }
      }
    }
  });

  it('wraps long labels to at most four lines', () => {
    const lines = wrapLabel('satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas dua belas', 120, 14, 600, estimateWidth);
    expect(lines.length).toBeLessThanOrEqual(4);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('finds the path to a node and folds large maps by default', () => {
    expect(findPath(tree, 'n3')?.map((n) => n.id)).toEqual(['n0', 'n1', 'n3']);
    expect(defaultCollapsed(tree).size).toBe(0);
    const big: MindNode = {
      id: 'r',
      label: 'R',
      children: Array.from({ length: 10 }, (_, i) => ({
        id: `b${i}`,
        label: `B${i}`,
        children: Array.from({ length: 4 }, (_, j) => ({ id: `b${i}c${j}`, label: `C${j}`, children: [{ id: `b${i}c${j}d`, label: 'D' }] })),
      })),
    };
    expect(defaultCollapsed(big).size).toBeGreaterThan(0);
    expect(defaultCollapsed(big).has('r')).toBe(false);
  });
});
