import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Graph, type GraphTheme } from './Graph';
import { canvasMeasure, type Layout } from './layout';
import type { MindRelation } from './types';
import styles from './MindMap.module.css';

export interface CanvasHandle {
  zoomBy: (factor: number) => void;
  fit: () => void;
  reset: () => void;
  centerOn: (id: string) => void;
  zoomPercent: () => number;
}

interface Props {
  layout: Layout;
  relations: MindRelation[];
  theme: GraphTheme;
  selected: string | null;
  showRelations: boolean;
  collapsed: ReadonlySet<string>;
  matches: ReadonlySet<string> | null;
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  onZoom?: (percent: number) => void;
  label: string;
}

const MIN_K = 0.2;
const MAX_K = 2.5;
const clampK = (k: number) => Math.max(MIN_K, Math.min(MAX_K, k));

/**
 * Pan/zoom SVG surface. Drag or one-finger swipe pans; pinch or Ctrl/Cmd + wheel zooms; the plain
 * wheel is left alone so the page can still scroll. Arrow keys pan and +/- zoom when focused.
 */
export const MindMapCanvas = forwardRef<CanvasHandle, Props>(function MindMapCanvas(
  { layout, relations, theme, selected, showRelations, collapsed, matches, onSelect, onToggle, onZoom, label },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const interacted = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startDist: number; startK: number } | null>(null);
  const justDragged = useRef(false);

  const size = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { w: r?.width || 800, h: r?.height || 520 };
  };

  const commit = useCallback(
    (next: { k: number; tx: number; ty: number }) => {
      viewRef.current = next;
      setView(next);
      onZoom?.(Math.round(next.k * 100));
    },
    [onZoom],
  );

  const fit = useCallback(() => {
    const { w, h } = size();
    const b = layout.bbox;
    const minK = w < 520 ? 0.74 : 0.25; // narrow screens: keep text readable, pan for the rest
    const k = Math.max(minK, Math.min(1.25, Math.min((w - 40) / b.w, (h - 40) / b.h)));
    commit({ k, tx: w / 2 - (b.x + b.w / 2) * k, ty: h / 2 - (b.y + b.h / 2) * k });
  }, [layout, commit]);

  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const v = viewRef.current;
      const k = clampK(v.k * factor);
      const f = k / v.k;
      commit({ k, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f });
    },
    [commit],
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomBy: (factor) => {
        interacted.current = true;
        const { w, h } = size();
        zoomAt(w / 2, h / 2, factor);
      },
      fit: () => {
        interacted.current = false;
        fit();
      },
      reset: () => {
        interacted.current = true;
        const { w, h } = size();
        commit({ k: 1, tx: w / 2, ty: h / 2 });
      },
      centerOn: (id) => {
        const o = layout.byId.get(id);
        if (!o) return;
        interacted.current = true;
        const { w, h } = size();
        const k = Math.max(viewRef.current.k, 0.9);
        commit({ k, tx: w / 2 - (o.x + o.w / 2) * k, ty: h / 2 - o.cy * k });
      },
      zoomPercent: () => Math.round(viewRef.current.k * 100),
    }),
    [commit, fit, layout, zoomAt],
  );

  // Auto-fit on first layout and while the user has not touched the view.
  useLayoutEffect(() => {
    if (!interacted.current) fit();
  }, [fit]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!interacted.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // Non-passive wheel handler: only Ctrl/Cmd+wheel (and trackpad pinch) zoom, so page scroll is untouched.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      interacted.current = true;
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0022));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { moved: false, startDist: 0, startK: viewRef.current.k };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current.startDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (!gesture.current.moved && Math.hypot(dx, dy) < 4) return;
      if (!gesture.current.moved) {
        gesture.current.moved = true;
        try {
          svgRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      interacted.current = true;
      pointers.current.set(e.pointerId, cur);
      const v = viewRef.current;
      commit({ ...v, tx: v.tx + dx, ty: v.ty + dy });
    } else if (pointers.current.size === 2) {
      pointers.current.set(e.pointerId, cur);
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.startDist > 0) {
        gesture.current.moved = true;
        interacted.current = true;
        const r = wrapRef.current?.getBoundingClientRect();
        const mx = (a.x + b.x) / 2 - (r?.left ?? 0);
        const my = (a.y + b.y) / 2 - (r?.top ?? 0);
        const target = clampK(gesture.current.startK * (dist / gesture.current.startDist));
        zoomAt(mx, my, target / viewRef.current.k);
      }
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (gesture.current?.moved) {
        justDragged.current = true;
        setTimeout(() => {
          justDragged.current = false;
        }, 0);
      }
      gesture.current = null;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as Element).closest('[role="button"]')) return; // node-level keys handled by the nodes
    const step = 60;
    const v = viewRef.current;
    const { w, h } = size();
    let handled = true;
    if (e.key === 'ArrowLeft') commit({ ...v, tx: v.tx + step });
    else if (e.key === 'ArrowRight') commit({ ...v, tx: v.tx - step });
    else if (e.key === 'ArrowUp') commit({ ...v, ty: v.ty + step });
    else if (e.key === 'ArrowDown') commit({ ...v, ty: v.ty - step });
    else if (e.key === '+' || e.key === '=') zoomAt(w / 2, h / 2, 1.2);
    else if (e.key === '-' || e.key === '_') zoomAt(w / 2, h / 2, 1 / 1.2);
    else if (e.key === '0') {
      interacted.current = false;
      fit();
    } else handled = false;
    if (handled) {
      e.preventDefault();
      interacted.current = true;
    }
  };

  return (
    <div ref={wrapRef} className={styles.canvas}>
      <svg
        ref={svgRef}
        className={styles.svg}
        role="application"
        aria-label={label}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (!justDragged.current) onSelect(null);
        }}
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          <Graph
            layout={layout}
            relations={relations}
            theme={theme}
            selected={selected}
            showRelations={showRelations}
            collapsed={collapsed}
            matches={matches}
            interactive
            textWidth={canvasMeasure}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        </g>
      </svg>
    </div>
  );
});
