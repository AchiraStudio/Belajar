import { AnimatePresence, motion } from 'motion/react';
import { useState, type KeyboardEvent } from 'react';
import { MAP } from '../../../data/content';
import { EASE_OUT } from '../../../lib/motion';
import { Caption, Win } from '../../ui/Frames';
import local from './MindMapPanel.module.css';
import styles from './Panel.module.css';

type Branch = (typeof MAP.branches)[number];

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const m = x1 + (x2 - x1) / 2;
  return `M${x1} ${y1} C ${m} ${y1}, ${m} ${y2}, ${x2} ${y2}`;
};

/** "η = 1 − Tc / Th" gets real subscripts; every other label is plain. */
function LeafLabel({ text }: { text: string }) {
  if (text !== 'η = 1 − Tc / Th') return <>{text}</>;
  return <>η = 1 − T<tspan dy="3" fontSize="10">c</tspan><tspan dy="-3"> / T</tspan><tspan dy="3" fontSize="10">h</tspan></>;
}

export function MindMapPanel() {
  const [open, setOpen] = useState<Record<string, boolean>>({ b1: true, b2: true, b3: true });
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const onKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(id); }
  };
  const { root, leafX, leafW, leafH } = MAP;
  const rootCy = root.y + root.h / 2;
  const showCross = open.b2 && open.b3;

  return (
    <div className={styles.panel}>
      <Win className={local.win}>
        <svg viewBox="0 0 720 380" role="group" aria-label="Sample mind map of the Carnot cycle. Branch nodes can be collapsed and expanded.">
          {/* branch edges */}
          <g className={local.edges}>
            {MAP.branches.map((b, i) => (
              <motion.path
                key={b.id}
                d={curve(root.x + root.w, rootCy, b.x, b.y + b.h / 2)}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.08, ease: EASE_OUT }}
              />
            ))}
          </g>

          {/* leaves, per branch */}
          {MAP.branches.map((b) => (
            <AnimatePresence key={b.id} initial={false}>
              {open[b.id] && (
                <motion.g key="leaves" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                  {b.leaves.map((label, i) => {
                    const ly = b.leafY[i]!;
                    const cy = b.y + b.h / 2;
                    return (
                      <g key={label}>
                        <motion.path
                          className={local.edge}
                          d={curve(b.x + b.w, cy, leafX, ly + leafH / 2)}
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          exit={{ pathLength: 0 }}
                          transition={{ duration: 0.45, delay: i * 0.05, ease: EASE_OUT }}
                        />
                        <motion.g
                          className={local.leaf}
                          initial={{ opacity: 0, x: -34 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -34 }}
                          transition={{ duration: 0.45, delay: 0.08 + i * 0.06, ease: EASE_OUT }}
                        >
                          <rect x={leafX} y={ly} width={leafW} height={leafH} rx={10} />
                          <text x={leafX + 15} y={ly + 21}><LeafLabel text={label} /></text>
                        </motion.g>
                      </g>
                    );
                  })}
                </motion.g>
              )}
            </AnimatePresence>
          ))}

          {/* cross-link between two leaves in different branches */}
          <AnimatePresence>
            {showCross && (
              <motion.path
                className={local.cross}
                d="M690 206 C716 206,716 346,690 346"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                exit={{ pathLength: 0, opacity: 0 }}
                transition={{ duration: 0.6, ease: EASE_OUT }}
              />
            )}
          </AnimatePresence>

          {/* root */}
          <motion.g className={local.root} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE_OUT }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            <rect className={local.rootShadow} x={root.x + 4} y={root.y + 4} width={root.w} height={root.h} rx={14} />
            <rect x={root.x} y={root.y} width={root.w} height={root.h} rx={14} />
            <text x={root.x + root.w / 2} y={root.y + 34} textAnchor="middle">{root.label}</text>
          </motion.g>

          {/* branches: the only interactive nodes */}
          {MAP.branches.map((b: Branch) => {
            const isOpen = open[b.id]!;
            const cy = b.y + b.h / 2;
            return (
              <motion.g
                key={b.id}
                className={`${local.branch} ${local["tone-" + b.tone]}`}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                aria-label={`${b.label}, ${isOpen ? 'collapse' : 'expand'}`}
                onClick={() => toggle(b.id)}
                onKeyDown={onKey(b.id)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              >
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12} />
                <text x={b.x + 50} y={b.y + 27} textAnchor="middle">{b.label}</text>
                <g className={local.knob}>
                  <circle cx={b.x + b.w - 20} cy={cy} r={11} />
                  <text x={b.x + b.w - 20} y={cy + 4.5} textAnchor="middle">{isOpen ? '−' : `+${b.leaves.length}`}</text>
                </g>
              </motion.g>
            );
          })}
        </svg>
        <Caption>Sample map. Click a branch to collapse it. The dashed line is a cross-link.</Caption>
      </Win>
      <div className={styles.copy}>
        <h3>Concepts, with the links between them.</h3>
        <p>The map is an AI-built concept tree with cross-links. Pan, zoom, collapse branches, switch to a list view, export to SVG or PNG, and jump from any node back to the note it came from.</p>
      </div>
    </div>
  );
}
