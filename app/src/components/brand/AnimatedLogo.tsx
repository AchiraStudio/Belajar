import React from 'react';
import styles from './AnimatedLogo.module.css';

/** The bamboo's centreline, measured from the logo: from the mouth along the S to its curled tail. */
const TUBE =
  'M318 238 C314 238 304 237 295 235 C286 234 278 230 265 229 C253 228 235 228 220 227 C205 227 188 226 175 226 C163 227 155 227 145 230 C135 233 124 239 115 243 C107 247 100 249 94 252 C88 255 84 258 80 261 C76 264 74 269 72 272 C70 276 70 279 70 282 C70 285 70 288 73 291 C76 294 81 297 86 300 C91 303 98 307 103 310 C109 313 115 317 119 320 C123 324 124 328 125 331 C126 335 125 338 124 341 C123 344 119 348 117 351 C115 354 115 357 112 360 C109 363 103 368 98 369 C93 370 87 370 82 368 C77 366 71 362 68 358 C65 355 63 349 62 347';

/**
 * The Stuby panda, drawn from simple shapes so every part can move. It is a faithful redraw of the
 * traced logo (public/brand), not a different character: same ears, eye patches, nose, bamboo S and leaves,
 * same colours.
 *
 *   state="intro"  drops in, eyes open, the bamboo grows out of its mouth along the S, then it chews
 *   state="loop"   chewing, blinking, a little head bob (the idle while things load)
 *   state="happy"  a small hop, for "ready"
 *
 * Everything is CSS animation on transform/opacity/stroke-dashoffset (cheap, interruptible). With
 * reduced motion it shows the finished picture and only the blink and the head bob stay, very gently.
 * It is decorative: the screen around it carries the real status text.
 */
export function AnimatedLogo({
  state = 'loop',
  size = 220,
  className = '',
}: {
  state?: 'intro' | 'loop' | 'happy';
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`${styles.art} ${styles[state]} ${className}`.trim()}
      viewBox="0 0 418 416"
      width={size}
      height={(size * 416) / 418}
      aria-hidden="true"
      focusable="false"
    >
      <g className={styles.shadow}>
        <ellipse cx="215" cy="398" rx="125" ry="9" />
      </g>

      <g className={styles.body}>
        <g className={styles.head}>
          <circle className={`${styles.ear} ${styles.earL}`} cx="106" cy="65" r="53" />
          <circle className={`${styles.ear} ${styles.earR}`} cx="325" cy="65" r="53" />
          <ellipse className={styles.face} cx="215" cy="184" rx="143" ry="106" />
          <g className={styles.eyeL}>
            <ellipse cx="154.3" cy="157.6" rx="31.3" ry="45.6" transform="rotate(36.5 154.3 157.6)" />
          </g>
          <g className={styles.eyeR}>
            <ellipse cx="275.3" cy="157.7" rx="31.2" ry="44.2" transform="rotate(-31.6 275.3 157.7)" />
          </g>
          <path className={styles.nose} d="M199 186 Q215 176 231 186 Q229 202 215 206 Q201 202 199 186Z" />
          <g className={styles.mouth}>
            <path d="M193 210 Q204 222 215 210 Q226 222 237 210" />
          </g>
        </g>

        {/* The bamboo S: an ink outline, a green tube, thin joints, and two leaves. It grows from the mouth. */}
        <g className={styles.bamboo}>
          <path className={styles.tubeOutline} pathLength={100} d={TUBE} />
          <path className={styles.tube} pathLength={100} d={TUBE} />
          <path className={styles.joints} pathLength={100} d={TUBE} />
        </g>
        <path className={`${styles.leaf} ${styles.leafA}`} d="M316 232 C328 204 356 196 382 210 C370 236 338 246 316 232Z" />
        <path className={`${styles.leaf} ${styles.leafB}`} d="M64 350 C44 326 22 326 14 342 C28 362 54 366 64 350Z" />
      </g>
    </svg>
  );
}
