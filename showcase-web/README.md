# Stuby showcase (React + Vite)

The marketing/landing site for Stuby, rebuilt from the static `showcase/` page as a modular React app.

```
npm install
npm run dev      # http://localhost:5188
npm run build    # typecheck + production build into dist/ (relative base, host anywhere)
```

- `src/data/content.ts`: all copy and sample data, apart from the components.
- `src/components/ui/`: shared pieces (Button, Segmented, Reveal, frames, AutoHeight, CountUp).
- `src/components/layout/`: header, scroll stalk, footer.
- `src/components/sections/`: one folder or file per page section; `loop/` holds the six interactive panels.
- `src/styles/tokens.css`: colours and fonts (same tokens as the app). The theme is always resolved to
  `light` or `dark` on `<html data-theme>`; the toggle uses a View Transition circle wipe where supported.
- Animation uses `motion` (`motion/react`). `MotionConfig reducedMotion="user"` drops transforms and keeps fades.
