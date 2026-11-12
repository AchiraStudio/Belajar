import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { COMMANDS, PLATFORMS } from '../../data/content';
import { spring } from '../../lib/motion';
import { Icon } from '../ui/Icon';
import { Reveal } from '../ui/Reveal';
import { SectionHead } from '../ui/SectionHead';
import styles from './Run.module.css';

type Status = { text: string; error: boolean } | null;

function CodeBlock({ id, commands, onStatus }: { id: string; commands: string; onStatus: (s: Status) => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commands);
      onStatus({ text: 'Copied the commands to your clipboard.', error: false });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure origin, permissions): select the text so Ctrl+C works.
      const pre = document.getElementById(id);
      if (pre) {
        const r = document.createRange();
        r.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
      onStatus({ text: 'Your browser blocked copying. The commands are selected, press Ctrl+C.', error: true });
    }
  };

  return (
    <div className={styles.preWrap}>
      <pre id={id} tabIndex={0}><code>{commands}</code></pre>
      <button type="button" className={styles.copy} onClick={copy}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copied ? 'done' : 'idle'}
            className={styles.copyIn}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
          >
            <Icon name={copied ? 'check' : 'copy'} size={18} />
            {copied ? 'Copied' : 'Copy commands'}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  );
}

export function Run() {
  const [status, setStatus] = useState<Status>(null);

  return (
    <section className={`wrap ${styles.run}`} id="run" aria-labelledby="h-run">
      <SectionHead
        kicker="Run it"
        id="h-run"
        title="Yours to host. Yours to read."
        sub="There are no installers to download yet. You build Stuby from source, and the repository has the setup guides."
      />

      <ul className={styles.platforms}>
        {PLATFORMS.map((p, i) => (
          <Reveal as="li" key={p.name} delay={i * 0.06} className={p.dim ? styles.dim : undefined}>
            <motion.div className={styles.row} whileHover={p.dim ? undefined : { x: 8 }} transition={spring.snappy}>
              <h3>{p.name}</h3>
              <p>{p.text}</p>
              <span className={styles.stat}>{p.status}</span>
            </motion.div>
          </Reveal>
        ))}
      </ul>

      <div className={styles.codeGrid}>
        <Reveal className={styles.code}>
          <h3>Look around first</h3>
          <p>Opens the whole interface in your browser with fictional data. No database, no server.</p>
          <CodeBlock id="code-mock" commands={COMMANDS.mock} onStatus={setStatus} />
        </Reveal>
        <Reveal className={styles.code} delay={0.1}>
          <h3>Run it for real</h3>
          <p>Needs Rust, Node.js 22 or newer and a PostgreSQL database, either a Supabase project or the local one from <code>stuby-devdb</code>. The server also reads <code>DATABASE_URL</code> and <code>APP_PASSWORD</code>.</p>
          <CodeBlock id="code-real" commands={COMMANDS.real} onStatus={setStatus} />
        </Reveal>
      </div>
      <p className={`${styles.status} ${status?.error ? styles.err : ''}`} role="status" aria-live="polite">{status?.text}</p>
    </section>
  );
}
