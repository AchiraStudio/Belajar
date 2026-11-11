import React from 'react';
import type { Layout, LayoutNode } from './layout';
import type { MindRelation } from './types';

/** Explicit colours (not CSS variables) so an exported SVG/PNG is self-contained. */
export interface GraphTheme {
  pal: string[];
  surface: string;
  ink: string;
  ink2: string;
  root: string;
  rootInk: string;
  onBranch: string;
  rel: string;
  relInk: string;
  tint: number;
}

export const THEME_LIGHT: GraphTheme = {
  pal: ['#5B50E0', '#1F8F6B', '#C2680F', '#0B8AA8', '#B33F8E', '#7B52D4', '#9A7414', '#C24A5B'],
  surface: '#FFFFFF',
  ink: '#17213B',
  ink2: '#64718C',
  root: '#4A3FD0',
  rootInk: '#FFFFFF',
  onBranch: '#FFFFFF',
  rel: '#D9722B',
  relInk: '#A4521B',
  tint: 0.88,
};

export const THEME_DARK: GraphTheme = {
  pal: ['#948BFF', '#4FD0A0', '#F2A25C', '#58CBE0', '#F28AC4', '#B79CFF', '#E8C25A', '#FF8E9C'],
  surface: '#151F34',
  ink: '#EDF3FF',
  ink2: '#A7B5CC',
  root: '#7D72F5',
  rootInk: '#FFFFFF',
  onBranch: '#0C1222',
  rel: '#F0904F',
  relInk: '#FFB27F',
  tint: 0.82,
};

const rgb = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x.map((v, i) => Math.round(v * (1 - t) + (y[i] ?? 0) * t).toString(16).padStart(2, '0')).join('')}`;
}

const bez = (t: number, a: number, b: number, c: number, d: number) =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;

export interface GraphProps {
  layout: Layout;
  relations: MindRelation[];
  theme: GraphTheme;
  selected: string | null;
  showRelations: boolean;
  collapsed: ReadonlySet<string>;
  /** When set, nodes not in this set are dimmed (search). */
  matches?: ReadonlySet<string> | null;
  interactive: boolean;
  textWidth?: (text: string, size: number, weight: number) => number;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
}

export const Graph = React.memo(function Graph({
  layout,
  relations,
  theme: th,
  selected,
  showRelations,
  collapsed,
  matches,
  interactive,
  textWidth,
  onSelect,
  onToggle,
}: GraphProps) {
  const colorOf = (o: LayoutNode) => (o.branch < 0 ? th.root : (th.pal[o.branch % th.pal.length] as string));

  const edges = layout.nodes
    .filter((o) => o.parent)
    .map((o) => {
      const p = o.parent as LayoutNode;
      const right = o.side === 1;
      const sx = p.depth === 0 ? (right ? p.w / 2 : -p.w / 2) : right ? p.x + p.w : p.x;
      const sy = p.cy;
      const ex = right ? o.x : o.x + o.w;
      const ey = o.cy;
      const dx = (ex - sx) / 2;
      return (
        <path
          key={o.n.id}
          d={`M${sx} ${sy}C${sx + dx} ${sy} ${ex - dx} ${ey} ${ex} ${ey}`}
          stroke={colorOf(o)}
          strokeWidth={o.depth === 1 ? 3.2 : o.depth === 2 ? 2.2 : 1.6}
          strokeLinecap="round"
          opacity={matches && !matches.has(o.n.id) ? 0.25 : o.depth === 1 ? 0.95 : 0.8}
        />
      );
    });

  const rels = showRelations
    ? relations.map((r, i) => {
        const a = layout.byId.get(r.from);
        const b = layout.byId.get(r.to);
        if (!a || !b) return null;
        const aRight = b.x + b.w / 2 >= a.x + a.w / 2;
        const sx = aRight ? a.x + a.w : a.x;
        const sy = a.cy;
        const ex = !aRight ? b.x + b.w : b.x;
        const ey = b.cy;
        const near = Math.abs(ex - sx) < 120;
        const bulge = (a.side || 1) * 90;
        const c1x = near ? sx + bulge : sx + (ex - sx) * 0.4;
        const c2x = near ? ex + bulge : ex - (ex - sx) * 0.4;
        const active = selected != null && (selected === r.from || selected === r.to);
        const dim = selected != null && !active;
        const mx = bez(0.5, sx, c1x, c2x, ex);
        const my = bez(0.5, sy, sy, ey, ey);
        const w = r.label ? (textWidth ? textWidth(r.label, 11.5, 650) : r.label.length * 6.6) + 14 : 0;
        return (
          <g key={`${r.from}-${r.to}-${i}`}>
            <path
              d={`M${sx} ${sy}C${c1x} ${sy} ${c2x} ${ey} ${ex} ${ey}`}
              fill="none"
              stroke={th.rel}
              strokeWidth={active ? 2.8 : 1.8}
              strokeDasharray="5 4"
              opacity={dim ? 0.4 : 0.92}
            />
            {r.label && (
              <g opacity={dim ? 0.5 : 1}>
                <rect x={mx - w / 2} y={my - 10} width={w} height={20} rx={10} fill={th.surface} stroke={th.rel} strokeWidth={1} />
                <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fontSize={11.5} fontWeight={650} fill={th.relInk}>
                  {r.label}
                </text>
              </g>
            )}
          </g>
        );
      })
    : null;

  const nodes = layout.nodes.map((o) => {
    const col = colorOf(o);
    const isRoot = o.depth === 0;
    const solid = isRoot || o.depth === 1;
    const fill = isRoot ? th.root : solid ? col : mix(col, th.surface, th.tint);
    const ink = isRoot ? th.rootInk : solid ? th.onBranch : th.ink;
    const sel = selected === o.n.id;
    const dim = matches != null && !matches.has(o.n.id);
    const cx = o.x + o.w / 2;
    const top = o.y + (o.hgt - o.lines.length * o.lh) / 2 + o.lh / 2;
    const handlers = interactive
      ? {
          role: 'button' as const,
          tabIndex: 0,
          'aria-pressed': sel,
          'aria-label': o.n.label,
          'data-node': o.n.id,
          style: { cursor: 'pointer', outline: 'none' },
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelect?.(o.n.id);
          },
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect?.(o.n.id);
            }
          },
        }
      : {};
    const count = (o.n.children ?? []).length;
    const closed = collapsed.has(o.n.id);
    const tx = o.side === 1 ? o.x + o.w + 12 : o.x - 12;
    return (
      <g key={o.n.id} opacity={dim ? 0.3 : 1}>
        <g {...handlers}>
          <rect
            className={interactive ? 'mm-box' : undefined}
            x={o.x}
            y={o.y}
            width={o.w}
            height={o.hgt}
            rx={Math.min(14, o.hgt / 2)}
            fill={fill}
            stroke={sel ? th.ink : solid ? fill : col}
            strokeWidth={sel ? 3.2 : 1.8}
          />
          {o.lines.map((ln, i) => (
            <text
              key={i}
              x={cx}
              y={top + i * o.lh}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={o.size}
              fontWeight={o.weight}
              fill={ink}
            >
              {ln}
            </text>
          ))}
        </g>
        {!isRoot && o.hasKids && (
          <g
            {...(interactive
              ? {
                  role: 'button' as const,
                  tabIndex: 0,
                  'aria-label': closed ? `Buka ${count} sub-topik ${o.n.label}` : `Ciutkan ${o.n.label}`,
                  'aria-expanded': !closed,
                  style: { cursor: 'pointer', outline: 'none' },
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    onToggle?.(o.n.id);
                  },
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggle?.(o.n.id);
                    }
                  },
                }
              : {})}
          >
            <circle cx={tx} cy={o.cy} r={10} fill={th.surface} stroke={col} strokeWidth={1.8} />
            <text x={tx} y={o.cy + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={closed ? 11 : 14} fontWeight={700} fill={th.ink2}>
              {closed ? String(count) : '−'}
            </text>
          </g>
        )}
      </g>
    );
  });

  return (
    <>
      <g fill="none">{edges}</g>
      <g>{rels}</g>
      <g>{nodes}</g>
    </>
  );
});
