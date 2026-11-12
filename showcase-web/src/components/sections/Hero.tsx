import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react';
import { Fragment, useRef, type PointerEvent } from 'react';
import mark from '../../assets/brand/stuby-mark.svg';
import homeDark from '../../assets/shots/home-dark.webp';
import homeLight from '../../assets/shots/home-light.webp';
import mHomeDark from '../../assets/shots/m-home-dark.webp';
import mHomeLight from '../../assets/shots/m-home-light.webp';
import { HERO_FACTS, REPO_URL } from '../../data/content';
import { EASE_OUT, spring } from '../../lib/motion';
import { Button } from '../ui/Button';
import { Phone, ThemedImage, Win } from '../ui/Frames';
import styles from './Hero.module.css';

/** Words rise out of a clipped line, one after another. Plain text stays readable to screen readers. */
function Words({ text, start = 0 }: { text: string; start?: number }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span className={styles.mask}>
            <motion.span
              className={styles.word}
              initial={{ y: '115%', rotate: 4 }}
              animate={{ y: 0, rotate: 0 }}
              transition={{ duration: 0.85, delay: start + i * 0.07, ease: EASE_OUT }}
            >
              {w}
            </motion.span>
          </span>
        </Fragment>
      ))}
    </>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);

  // Pointer tilt on the main window: depth that follows the cursor, easing back when it leaves.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [5, -5]), spring.soft);
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-6, 6]), spring.soft);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => { px.set(0); py.set(0); };

  // Scroll parallax: the phone and the panda drift at different speeds from the window.
  const { scrollYProgress } = useScroll({ target: root, offset: ['start start', 'end start'] });
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, -110]);
  const pandaY = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const winY = useTransform(scrollYProgress, [0, 1], [0, -30]);

  return (
    <section ref={root} className={`wrap ${styles.hero}`} aria-labelledby="h-hero">
      <div className={styles.copy}>
        <h1 id="h-hero">
          <span className={styles.l1}><Words text="Upload it once." start={0.1} /></span>
          <motion.span
            className={styles.hl}
            initial={{ backgroundSize: '0% 100%' }}
            animate={{ backgroundSize: '100% 100%' }}
            transition={{ duration: 0.9, delay: 0.55, ease: EASE_OUT }}
          >
            <Words text="Study it every way." start={0.35} />
          </motion.span>
        </h1>
        <motion.p className={styles.lede} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.7, ease: EASE_OUT }}>
          Stuby reads your PDFs, slides and notes, builds notes, a mind map, quizzes, flashcards and games from them, and keeps score of what you actually know.
        </motion.p>
        <motion.div className={styles.cta} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.82, ease: EASE_OUT }}>
          <Button variant="primary" href="#loop">See what one PDF becomes</Button>
          <Button href={REPO_URL} target="_blank">Read the source on GitHub</Button>
        </motion.div>
        <dl className={styles.facts}>
          {HERO_FACTS.map((f, i) => (
            <motion.div
              key={f.k}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 1 + i * 0.09, ease: EASE_OUT }}
            >
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </motion.div>
          ))}
        </dl>
      </div>

      <div className={styles.visual} onPointerMove={onMove} onPointerLeave={onLeave}>
        <motion.div className={styles.pandaWrap} style={{ y: pandaY }}>
          <motion.img
            className={styles.panda}
            src={mark}
            alt="The Stuby panda chewing a bamboo stalk"
            width={170}
            height={168}
            initial={{ y: -90, opacity: 0, rotate: -14 }}
            animate={{ y: 0, opacity: 1, rotate: 5 }}
            transition={{ ...spring.bouncy, delay: 0.9 }}
          />
        </motion.div>

        <motion.div className={styles.winWrap} style={{ y: winY }}>
          <motion.div style={{ rotateX: rx, rotateY: ry, transformPerspective: 1100 }}>
            <Win
              className={styles.winHero}
              initial={{ opacity: 0, y: 60, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 1, delay: 0.3, ease: EASE_OUT }}
            >
              <ThemedImage
                light={homeLight}
                dark={homeDark}
                alt="The Stuby home screen: a study streak tile, quiz and material counts, promo banners and a Continue studying list"
                altDark="The Stuby home screen in the dark theme, with the floating dock along the bottom"
                width={1440}
                height={900}
                eager
              />
            </Win>
          </motion.div>
        </motion.div>

        <motion.div className={styles.phoneWrap} style={{ y: phoneY }}>
          <Phone
            className={styles.phoneHero}
            initial={{ opacity: 0, y: 80, rotate: -9 }}
            animate={{ opacity: 1, y: 0, rotate: -3 }}
            transition={{ ...spring.soft, delay: 0.7 }}
            whileHover={{ rotate: 0, y: -6 }}
          >
            <ThemedImage
              light={mHomeLight}
              dark={mHomeDark}
              alt="Stuby on a phone: a goal card, a Continue studying scroller and a stat strip"
              altDark="Stuby on a phone in the dark theme"
              width={780}
              height={1688}
              eager
            />
          </Phone>
        </motion.div>
      </div>
      <p className={styles.note}>Screens are real captures of the app running on its built-in fictional demo data.</p>
    </section>
  );
}
