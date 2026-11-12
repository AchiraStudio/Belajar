# Stuby: current design direction

> This section is the direction the UI is built to. The "Frost" brief below it is **superseded** wherever
> they disagree (it asked for glass everywhere; the owner asked for less glass and the logo's colours).
> Source: the owner's requests of 2026-11-12 (use the panda logo's identity, reduce the liquid-glass look,
> floating bottom bar that auto-hides, a reworked phone UI, an animated startup screen).

**Design Read:** a personal study platform for students on desktop and phone, in a sticker-outline style drawn
from the panda logo, dial **ENERGY 2 / RHYTHM 3 / MOTION 2**.

## Identity (from `app/public/brand/stuby-logo.svg`, traced from the supplied logo)

| Token | Value | Use | Why |
|---|---|---|---|
| ink | `#141816` | text, outlines, the dock | the logo's heavy outline |
| bamboo | `#8DC63F` | fills, the one action colour | the logo's green; ink text on it is 8.8:1 |
| bamboo-deep | `#2F7A1F` | text and links on light | bamboo itself is 1.9:1 on white, so it can never carry text |
| cream / white | `#F6F4EC` / `#FFFFFF` | page / cards | the panda's face |
| sun | `#F2B705` | the single accent (streak, "soon" dots) | one warm note, used sparingly |

Dark theme keeps the same roles on `#0E1210` / `#171C19` with `#9AD44B` as the accent.

## Decisions (one line of reason each)

- **Outline motif:** primary things (the dock, the main button, the streak tile, the banners, the phone's "today" card) get a 2px ink outline and a hard 3 to 4px ink shadow; everything else gets a hairline. The logo is drawn with a heavy outline, so this is the one repeated gesture that makes the app look like it belongs to the panda.
- **Glass:** exactly one element, the floating dock (dark ink, 14px blur). It floats over scrolling content, which is the only place blur earns its cost. Cards, dialogs, menus, toasts and the top bar are flat. `--blur-*` tokens are `none`; a test guards this.
- **Dock instead of sidebar:** one navigation for every screen size. Desktop shows every destination (complete, no "more"); a phone shows five tabs and a hold menu per tab. It hides when idle and returns on scroll, touch, the bottom edge or the keyboard, because it covers content; it stays in the tab order so keyboard users are never locked out.
- **No phone top bar:** the page owns the whole screen; search, profile and settings live in the dock's "more" sheet.
- **Phone home is its own composition:** one focal "today" card, then a sideways scroller, an inline stat strip, a column chart and chips. A grid of equal cards read as a template (RHYTHM 3).
- **Desktop stat tiles use four materials** (bamboo + outline, white, ink, sun tint) so the row has a focal point (the streak) instead of four equal boxes.
- **Banners:** four themes in the logo palette; paid placements say "Iklan"/"Promo" (never disguised).
- **Startup screen:** the panda is redrawn from shapes so it can move, and ends on the traced logo's geometry. The checklist shows only steps the app really performs (server, session, data); nothing is faked, and a failure shows the reason and a retry.
- **Typeface:** Bricolage (variable, up to weight 800): its chunky heavy weights echo the logo's wordmark.

## Dock behaviour (same on desktop and phone)

Hides after ~3.2s without activity. Returns on: scrolling anywhere, a touch/pen press, the mouse near the bottom edge, any key press, focus inside it, or the peek handle. Never hides while the pointer is over it, focus is inside it, or a menu is open. Reduced motion: a short plain slide, no overshoot.

---

# (Superseded) Stuby — Frontend Design System & Redesign Specification

> **Purpose:** This is the implementation brief for a complete visual and interaction redesign of the Stuby client. Treat it as the product-level source of truth for the frontend overhaul. The goal is a cohesive, premium **Frost UI** experience—not a superficial coat of glass effects.
>
> **Scope:** React frontend in `app/src/`, shared by the web client and the Tauri 2 desktop/mobile shell. This document describes the target experience and implementation constraints; it does not authorize changes to the Python agent, Node server, API contracts, database, AI prompts, or learning/scoring logic.

---

## 1. Product understanding

Stuby is a personal AI-powered learning workspace. A learner imports their own study materials, turns them into structured notes and mind maps, chats with AI about the material, practices quizzes, plays AI-guided learning games, reviews spaced-repetition cards, and tracks learning progress.

The redesign must make this breadth feel like **one connected learning product**. It should not look like a generic admin dashboard, a marketing website, or a collection of unrelated feature pages.

### Core product areas

Preserve and provide a clear visual home for all existing and planned client capabilities documented in the repository README and legacy context:

1. **Home / Overview** — daily learning summary, continue-learning entry point, study target, streak, due reviews, recent materials, and relevant next actions.
2. **Materials / Library** — imported files and learning materials, search, filtering, upload/import, processing state, and material-specific actions.
3. **Material workspace** — notes, source information, mind map, AI chat, and quizzes connected to one material.
4. **Notes** — generated notes in supported styles (including concise, Cornell, simple, and detailed methods), editable content, regeneration, Markdown export, print, math rendering, and safe code-block presentation.
5. **Mind maps** — navigable map with pan/zoom, collapsible branches, list alternative, search/jump-to-note behavior, and SVG/PNG export.
6. **AI chat / Ask** — material-grounded conversation, NEW and CONTINUE flows where supported, streamed responses, and clear generation/error states.
7. **Quizzes** — multiple choice, true/false, short answer, practice mode with feedback, exam mode with timer and persisted answers, and combined subject quizzes.
8. **Weak questions** — review queue for questions the learner previously answered incorrectly.
9. **Learning games** — hub for Ajari Aku, Detektif Salah Kaprah, Petualangan, Kasus Nyata, Kilat, and Ujian Boss. Preserve each mode's distinct instructions, turn flow, hints, scoring feedback, and session state.
10. **Flashcards** — due cards, SM-2 review flow, progress, and Anki TSV export.
11. **Progress / Mastery** — quiz history and scores, topic mastery, weak/strong concepts, per-material progress, recent study time, weekly targets, activity history, XP, levels, badges, and daily missions where available.
12. **Settings** — account/session-related UI where supported, theme and appearance preferences, connection/health state, and application preferences. Do not invent settings or backend capabilities that do not exist.

These are product destinations, not a demand to create fake pages or fake data. If a capability has not yet been ported to the new React client, show a deliberate, honest unavailable/coming-soon state or leave its navigation entry clearly marked as not yet migrated. Never simulate successful AI output, saved progress, connectivity, or completed uploads.

---

## 2. Design direction: premium Frost UI

### The visual idea

Build a calm, focused, high-quality desktop learning environment using **layered translucent surfaces, soft atmospheric light, subtle blur, delicate borders, and excellent typography**.

The interface should feel like a modern native productivity app: tactile, precise, composed, and quietly expressive. Frost is a material language, not an effect applied to every rectangle.

Visual keywords:
- Frosted glass, translucent acrylic, soft diffusion, layered depth.
- Cool, luminous, clean, spacious, editorial, calm.
- Subtle indigo/violet identity with icy blue highlights.
- Strong hierarchy and high legibility.
- Crisp icons, thin separators, intentional negative space.
- Restrained gradients and ambient light—not neon cyberpunk.

### What it must NOT look like

- Not a generic shadcn dashboard with default cards everywhere.
- Not a glassmorphism Dribbble mockup that sacrifices usability.
- Not a blur-heavy interface where text loses contrast.
- Not a neon gaming UI, crypto dashboard, or sci-fi HUD.
- Not a dense spreadsheet/admin panel.
- Not a mobile website stretched to desktop dimensions.
- Not a collection of huge rounded cards with identical visual weight.

### Frost material hierarchy

Use three primary material levels:

1. **Base canvas:** mostly opaque, quiet background with very subtle cool-tinted ambient gradients. This is the stable visual foundation.
2. **Frost surfaces:** translucent panels for persistent navigation, floating toolbars, popovers, command surfaces, and selected overlays. Use backdrop blur only where it communicates physical layering.
3. **Solid content surfaces:** readable cards, editors, tables, quiz content, and long-form notes. Prefer near-opaque surfaces for information-dense work.

Glass should be selective. The sidebar, top chrome, floating panels, dialogs, and contextual controls can use frost. Long-form content and important controls must remain highly legible.

---

## 3. Color system

Create semantic CSS custom properties in `app/src/styles/tokens.css`. Components must consume semantic tokens, never scatter raw hex values throughout CSS.

Suggested starting palette (tune after implementing real screens):

### Light theme

| Token | Suggested value | Usage |
|---|---|---|
| `--canvas` | `#F3F6FC` | App background |
| `--canvas-tint` | `#EAF0FC` | Ambient cool tint |
| `--surface` | `rgba(255,255,255,.78)` | Frost panel |
| `--surface-solid` | `#FFFFFF` | Readable content |
| `--surface-raised` | `rgba(255,255,255,.92)` | Popovers / dialogs |
| `--text-primary` | `#17213B` | Main text |
| `--text-secondary` | `#64718C` | Supporting text |
| `--text-muted` | `#8C98AE` | Metadata |
| `--border` | `rgba(108,128,166,.18)` | Hairline borders |
| `--accent` | `#6558E8` | Primary brand action |
| `--accent-hover` | `#5144D5` | Hover / pressed |
| `--accent-soft` | `#EEECFF` | Selected / subtle accent |
| `--ice` | `#78BFEF` | Cool secondary highlight |
| `--success` | `#218B68` | Success |
| `--warning` | `#B7792E` | Warning |
| `--danger` | `#C94F62` | Destructive / error |

### Dark theme

Use a deep blue-slate foundation rather than pure black. Preserve separation between the canvas, translucent shell, solid content, and elevated surfaces. Text must remain comfortably readable.

Suggested starting values: canvas `#0C1222`, tinted canvas `#111B31`, solid surface `#151F34`, raised surface `#1B2942`, primary text `#EDF3FF`, secondary text `#A7B5CC`, border `rgba(173,196,230,.14)`, accent `#948BFF`, accent-soft `#29284D`, ice `#83C9F2`.

### Color rules

- Support explicit light, dark, and system theme selection.
- Theme changes must update the entire app consistently, including charts, dialogs, editors, code blocks, scrollbars, and menus.
- Never communicate state using color alone; pair it with text, iconography, or shape.
- Keep success, warning, and danger colors semantic and restrained.
- Do not use gradients as the only way to distinguish primary actions.
- Maintain WCAG AA contrast for normal text and essential controls.

---

## 4. Frost, depth, borders, and shadows

Define reusable tokens for material treatment:

- Frost panel: translucent surface + `backdrop-filter: blur(18px) saturate(145%)`.
- Strong frost: slightly more opaque + blur around 24px for dialogs/popovers.
- Hairline border: one subtle cool-tinted border, not a bright white outline.
- Ambient shadow: broad, low-opacity, cool shadow; avoid harsh black drop shadows.
- Inner highlight: optional 1px inset highlight on surfaces that need a glass edge.
- Use blur sparingly and provide a solid fallback when `backdrop-filter` is unavailable.

Depth must come from a consistent elevation scale, not random shadows. Establish levels for base, panel, raised panel, popover, and modal. Avoid stacking multiple blurred layers directly on top of one another.

---

## 5. Typography

The current app bundles Bricolage and Literata font files. Keep those local assets and use them intentionally:

- **Bricolage:** primary UI, navigation, controls, headings, labels, and numbers.
- **Literata:** optional editorial accent for selected learning/reading moments, such as a featured daily insight or a long-form reading heading. Do not use it for all interface text.

Use a clear type scale:
- Display / page title: 28–34px, strong weight, tight tracking.
- Section title: 18–22px.
- Card / panel title: 15–17px.
- Body: 14–16px with comfortable line height.
- Metadata: 12–13px.
- Dense data labels: never below 12px unless truly auxiliary.

Avoid overusing bold. Use weight, spacing, and contrast to create hierarchy. Long-form notes should prioritize reading comfort, line length, paragraph rhythm, and code/math legibility.

---

## 6. Application shell and navigation

### Desktop layout

Design a desktop-first workspace that remains responsive:

- **Left navigation rail/sidebar:** approximately 232–260px expanded, with a compact icon-only mode around 72px.
- **Top app bar:** approximately 56–64px; contains current page context, search/command access, connection status, and contextual actions.
- **Main content:** flexible, scrollable, with a comfortable maximum width for reading pages and wider layouts for maps, dashboards, and workspaces.
- **Optional contextual panel:** only for screens that genuinely benefit from a right-side inspector (for example, material metadata or mind-map outline). It must be collapsible.
- Keep content scroll independent from persistent shell chrome where appropriate.

### Navigation structure

Use clear groups rather than a long undifferentiated list:

- **Workspace:** Overview, Materials.
- **Study:** Flashcards, Quizzes, Weak Questions, Learning Games.
- **Insights:** Progress.
- **Preferences:** Settings, placed near the bottom.

Use concise Indonesian labels in the product UI, matching the existing product language. Navigation should expose active, hover, focus, disabled, and collapsed states. Do not create dead links.

### Desktop window chrome / Tauri

The current Tauri window uses `decorations: false`. Therefore:

- Build a custom, accessible title bar / window-control region for desktop Tauri where the platform requires it.
- Use Tauri's documented drag-region mechanism only on non-interactive title-bar areas.
- Keep minimize, maximize/restore, and close controls clearly separated from app navigation.
- Never make buttons, inputs, tabs, or links draggable.
- Account for Windows, macOS, and Linux differences; do not assume one platform's window-control placement is universal.
- In browser mode, do not render fake native window controls.
- The Rust shell currently registers no application commands. Do not invent Tauri commands or assume native file-picker, notification, credential, or save-file integrations exist. Use the current web/API behavior until a real native capability is implemented.

### Responsive behavior

- Desktop: full sidebar and workspace layout.
- Medium/tablet: collapsible sidebar or compact navigation; preserve usable multi-column workspaces where possible.
- Narrow/mobile: compact top bar and mobile navigation pattern; dialogs become full-screen sheets when appropriate.
- Respect safe-area insets on mobile.
- Avoid horizontal overflow. Mind maps and wide tables may have their own intentional scroll/zoom surfaces.

---

## 7. Core screen composition

### Overview

Create a calm, useful landing page—not a wall of metrics.

Recommended hierarchy:
1. Greeting and date/context.
2. One prominent **Continue learning** area based on real recent activity.
3. A compact row of meaningful daily indicators: streak, study time/target, due cards, and progress.
4. Recent materials with clear processing/ready/error states.
5. Today's suggested next actions (for example, review due cards or continue an unfinished quiz), only when supported by real state.
6. Recent activity or mastery snapshot.

Avoid fake charts, inflated stats, empty metric cards, and meaningless percentages. Empty state should guide the first useful action: import a material.

### Materials library

- Make upload/import the clear primary action.
- Provide search and useful filters (subject, date, status, or other fields only when supported).
- Use a visually balanced list/grid toggle if both layouts are useful.
- Each material row/card should show title, file type, subject/context if known, last activity, and honest processing state.
- Use contextual actions without cluttering every row.
- Include purposeful empty, loading, error, and upload-in-progress states.
- Confirm destructive actions and explain consequences.

### Material workspace

This is the product's central learning environment. Make the relationship between a material and its learning tools obvious.

- Material title and source metadata at the top.
- A clear tab/segmented navigation for Notes, Mind Map, AI Chat, and Quiz where the relevant features exist.
- Keep the material context visible without wasting vertical space.
- Preserve unsaved edits and communicate save state accurately.
- Do not reset a user's place or active tab unexpectedly when switching views.

### Notes and reading

- Use a reading-first layout with a comfortable maximum text width.
- Support headings, lists, tables, quotes, LaTeX, and syntax-highlighted code blocks.
- Code blocks need language labels and useful copy/download/fullscreen controls where implemented.
- Keep code content immutable in rendering; never execute user/model-provided code.
- Provide a clear edit/read mode, save status, regenerate controls, and export actions.
- Make regeneration destructive only with explicit confirmation when it could replace user edits.
- Avoid putting a heavy frosted card around every paragraph.

### Mind map

- Give the map the largest possible usable canvas.
- Put zoom, fit-to-view, reset, export, and view-mode controls in a compact floating toolbar.
- Provide a collapsible outline/list alternative for keyboard and small-screen users.
- Use restrained node colors and clear hierarchy.
- Pan/zoom should feel smooth but not fight page scrolling.
- Include loading, generation, failure, empty, and export states.
- Keep node labels readable at supported zoom levels.

### AI chat

- Visually distinguish learner and assistant messages without oversized chat bubbles.
- Support streamed partial output without layout jumps.
- Show which material/context the conversation is grounded in.
- Provide clear NEW/CONTINUE session behavior where applicable.
- Composer should remain accessible while reading long conversations.
- Include stop/cancel, retry, copy, and error recovery only where the current API supports them.
- Never expose internal tokens, provider secrets, or private agent details.

### Quizzes and exam mode

- Focus each screen on one question and its answer choices.
- Make answer selection, submission, correctness, and explanation states unmistakable.
- Practice mode: feedback can appear after answering.
- Exam mode: show timer and progress without distracting the learner; preserve the existing persisted-answer behavior.
- Provide clear previous/next navigation and an end-of-quiz confirmation/review summary.
- Keyboard navigation and visible focus are required.
- Do not accidentally reveal answers or explanations in exam mode before submission.

### Learning games

- Give the game hub a distinct but still cohesive identity: a little more expressive than the rest of the app, never a separate visual product.
- Each mode needs a concise explanation, estimated interaction pattern only if known, and a clear start/resume action.
- During a session, prioritize prompt/narrative, learner input, turn progress, hints, and relevant game state.
- Keep score, XP, lives, streak/combo, mastery, and mission feedback readable and secondary to the actual learning interaction.
- Hints must show their level and any scoring consequence accurately.
- Preserve session recovery and idempotent turn behavior from the backend; avoid duplicate submissions on double-click or retry.
- Make loading/streaming, interrupted, recovered, completed, and failed states explicit.

### Flashcards

- Design a focused review surface with one card as the main object.
- Make reveal, confidence/ease response, next-card progression, and session completion clear.
- Show due count and session progress without distracting from recall.
- Preserve the existing SM-2 scheduling behavior; visual redesign must not change rating semantics.
- Keep Anki export discoverable but secondary to review.

### Progress and mastery

- Prefer meaningful trends and actionable insight over decorative dashboards.
- Show quiz scores, concept mastery, weak/strong areas, per-material progress, recent study time, weekly targets, activity history, XP/levels/badges/missions where data exists.
- Use accessible chart labels and text summaries; charts must not be the only way to read values.
- Do not imply that an estimate is a measured fact.
- Clearly distinguish no data from zero progress.

### Settings

- Use grouped settings sections with clear descriptions and immediate feedback.
- Theme control must support Light, Dark, and System if implemented.
- Connection/health status should explain what is offline (client-to-server reachability), not imply local PC agent status unless that is actually the health contract.
- Avoid exposing technical configuration or secrets in ordinary user settings.

---

## 8. Component system

Build a small, consistent component library before styling every page independently. Reuse components; avoid copy-pasted CSS.

Recommended component families:

- **Shell:** `AppShell`, `Sidebar`, `NavItem`, `TopBar`, `TitleBar`, `MobileNavigation`, `PageContainer`.
- **Surfaces:** `FrostPanel`, `SurfaceCard`, `InsetPanel`, `PopoverSurface`, `ModalSurface`, `BottomSheet`.
- **Navigation:** `Tabs`, `SegmentedControl`, `Breadcrumbs`, `CommandMenu`.
- **Actions:** `Button` variants (primary, secondary, ghost, danger), `IconButton`, `SplitButton`, `MenuButton`.
- **Inputs:** `TextField`, `SearchField`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Textarea`, `FileDropzone`.
- **Feedback:** `StatusBadge`, `HealthIndicator`, `ProgressBar`, `Skeleton`, `Toast`, `InlineAlert`, `EmptyState`, `ErrorState`.
- **Learning:** `MaterialItem`, `MaterialStatus`, `MetricTile`, `NoteRenderer`, `CodeBlock`, `MathBlock`, `ChatMessage`, `QuizQuestion`, `Flashcard`, `MasteryIndicator`.

Component requirements:
- Every interactive component has hover, focus-visible, pressed, disabled, and loading states as appropriate.
- Use semantic HTML and accessible names. Icon-only buttons require an accessible label and tooltip.
- Prefer CSS Modules for component-scoped styles and shared CSS variables for theme tokens.
- Avoid introducing a component framework or dependency solely for decoration. If a library is proposed, justify its value, bundle impact, accessibility, and Tauri/WebView compatibility first.
- Use one icon family consistently (Lucide is a suitable direction); do not mix emoji, Unicode symbols, and multiple icon packs as interface icons.
- Keep components composable and data-driven; do not couple generic UI primitives to backend feature logic.

---

## 9. Motion and interaction feel

Motion should communicate state and hierarchy, not entertain.

- Typical micro-interactions: 120–200ms.
- Panel/sheet transitions: 180–260ms.
- Use restrained easing; avoid spring/bounce on routine navigation.
- Animate opacity and transform where possible; avoid expensive blur/filter animations.
- Sidebar collapse, tab changes, hover elevation, dropdowns, toasts, and progress transitions should feel consistent.
- Avoid animating large areas or continuously moving ambient backgrounds.
- Respect `prefers-reduced-motion`; provide a near-static experience when requested.
- Never delay a critical action behind a decorative animation.

---

## 10. Accessibility and localization

- The UI language is Indonesian. Keep labels, helper text, validation, empty states, and errors natural and consistent in Bahasa Indonesia.
- Use correct heading order and landmarks.
- Support keyboard-only operation across navigation, dialogs, menus, maps, quizzes, and flashcards.
- Trap focus inside modal dialogs, restore focus on close, and support Escape where appropriate.
- Use `aria-live` thoughtfully for async status and streamed responses; do not announce every token.
- Maintain visible focus indicators in both themes.
- Ensure touch targets are comfortable (aim for 40–44px).
- Do not rely on color, blur, or animation alone to communicate meaning.
- Ensure text remains readable over translucent backgrounds.

---

## 11. Performance and Tauri/WebView constraints

The frontend runs in a web browser and in Tauri's embedded webview, including constrained mobile devices. Design for predictable performance.

- Keep the existing React 19 + TypeScript + Vite + React Router stack unless a concrete technical reason requires a change.
- Use CSS variables and CSS Modules; avoid a large global stylesheet full of feature-specific rules.
- Use `backdrop-filter` selectively and avoid nested blur surfaces.
- Avoid large animated gradients, excessive box shadows, expensive filters, and unnecessary re-renders.
- Lazy-load heavy feature views and large visualization modules where practical.
- Virtualize long lists only when real data volume warrants it.
- Clean up timers, event listeners, observers, and subscriptions on unmount.
- Keep the frontend build self-contained. Do not add remote fonts, CDN scripts, or external runtime assets; the Tauri CSP is intentionally restrictive.
- Verify the design in the actual Tauri webview, not only in Chrome.
- Preserve responsive behavior and safe-area support.
- Provide graceful fallbacks for unsupported CSS effects.

---

## 12. Architecture and behavior preservation — non-negotiable

This is a **frontend redesign**, not a backend rewrite.

1. Preserve the React + TypeScript + Vite application and current Tauri 2 wrapper.
2. Preserve `HashRouter` and legacy hash URL compatibility. Existing routes such as `#/materi/3`, `#/kuis`, and other documented deep links must continue to resolve when their views are migrated.
3. Keep all server calls behind the existing typed API client (`app/src/services/api/client.ts`) or a deliberate typed service layer built on top of it. Do not scatter raw `fetch` calls across visual components.
4. Preserve the API base URL validation and token-provider seam in `app/src/config.ts` and the API client.
5. Treat server and agent responses as data. Validate at boundaries and render user/model content safely.
6. Do not move SQLite, file storage, AI credentials, prompts, scoring, mastery, SM-2, game judging, or business logic into the frontend.
7. Do not invent API endpoints, fields, actions, or Tauri commands. Inspect the actual server/agent contract before wiring a screen.
8. Preserve upload limits, document processing semantics, job polling, streaming behavior, retry rules, cancellation behavior, and error codes.
9. Preserve the current health contract: `GET /api/v1/health` checks client-to-server reachability. Do not relabel it as a local agent connection unless the backend explicitly exposes that state.
10. Preserve security constraints: no secrets in client bundles, no unsafe HTML injection, no arbitrary code execution, and no bypass of CSP.
11. Keep UI state and domain state distinct. A purely visual refactor must not silently alter quiz mode, answer persistence, hint penalties, game session idempotency, card scheduling, or progress calculations.
12. Add tests for behavior affected by the refactor; keep existing tests passing.

If an old feature is not yet available through the new client, do not reconstruct its backend behavior from memory or hardcode mock responses. First locate the real legacy implementation and API contract, then port it through typed services.

---

## 13. Suggested frontend structure

Adapt the existing structure rather than reorganizing the repository for its own sake. A practical target could be:

```text
app/src/
  app/
    App.tsx
    router.tsx
  components/
    layout/
      AppShell.tsx
      Sidebar.tsx
      TopBar.tsx
      TitleBar.tsx
    ui/
      Button/
      IconButton/
      FrostPanel/
      Dialog/
      Tabs/
      StatusBadge/
      ...
  features/
    overview/
    materials/
    material-workspace/
    notes/
    mindmap/
    chat/
    quizzes/
    weak-questions/
    games/
    flashcards/
    progress/
    settings/
    health/
  services/
    api/
      client.ts
      ...
  styles/
    tokens.css
    global.css
    themes.css
  hooks/
  types/
  test/
```

Feature folders should own feature-specific components, hooks, types, and styles. Shared primitives belong in `components/ui`. Keep the API client and domain contracts out of presentation components.

Do not create empty folders or placeholder abstractions just to match this tree. Introduce each module when its first real screen is implemented.

---

## 14. Implementation sequence

Deliver the redesign incrementally. Do not attempt a giant rewrite that leaves the application unbuildable.

### Phase 0 — Audit and baseline
- Inspect the complete current frontend, legacy frontend, server routes, agent handlers, and API contracts.
- Record existing route behavior and feature parity.
- Run current `npm run typecheck`, `npm test`, and `npm run build`; capture baseline failures before changing anything.
- Identify which legacy views/features have already been migrated and which are still pending.

### Phase 1 — Design foundation
- Implement semantic color, spacing, typography, radius, border, elevation, and motion tokens.
- Add light/dark/system theme behavior with persistence using an appropriate existing app preference mechanism; do not introduce a new backend requirement.
- Build shell, sidebar, top bar, responsive navigation, title bar, and page container.
- Validate desktop Tauri, browser, and mobile layouts.

### Phase 2 — Shared components
- Build buttons, inputs, cards/surfaces, badges, dialogs, tabs, menus, toasts, skeletons, empty/error states, and progress indicators.
- Document variants and interaction states in code comments or a small component showcase route used only in development.
- Verify keyboard and screen-reader behavior.

### Phase 3 — Primary learning flow
- Implement Overview and Materials Library.
- Implement Material Workspace navigation and the Notes reading/editing experience.
- Integrate real API behavior and loading/error/empty states; no mocked success paths.

### Phase 4 — Learning tools
- Implement Mind Map, AI Chat, Quizzes, Weak Questions, Flashcards, and Learning Games.
- Preserve feature-specific rules and session semantics.
- Use realistic fixture data only in tests/story previews, never as production fallback data.

### Phase 5 — Insights and settings
- Implement Progress/Mastery and Settings.
- Verify every chart and metric against actual API data.
- Finish theme coverage and responsive polish.

### Phase 6 — Quality pass
- Run typecheck, tests, production build, and relevant backend parity/E2E tests.
- Test keyboard-only flows, reduced motion, light/dark/system themes, narrow screens, and long content.
- Test the packaged Tauri app on supported desktop platforms and mobile targets where applicable.
- Inspect for console errors, broken routes, overflow, unreadable frost surfaces, and accidental behavior changes.

At every phase, keep the app runnable and commit in small, reviewable steps.

---

## 15. Acceptance criteria

The redesign is complete only when all of the following are true:

### Visual quality
- [ ] The app has a distinctive, cohesive premium Frost UI identity.
- [ ] Frost effects are selective, subtle, and never reduce readability.
- [ ] Light and dark themes both feel intentionally designed.
- [ ] Typography, spacing, radii, borders, shadows, and iconography are consistent.
- [ ] The app feels like a native productivity workspace rather than a generic web dashboard.
- [ ] Every major feature uses the same design language without looking identical.

### Product coverage
- [ ] All existing feature destinations are represented honestly.
- [ ] Overview, library, material workspace, notes, mind map, chat, quizzes, weak questions, games, flashcards, progress, and settings have coherent layouts.
- [ ] Empty, loading, success, offline, processing, and error states are designed—not left as browser defaults.
- [ ] No fake statistics, fake AI responses, or dead navigation items are present.

### Functional integrity
- [ ] Existing API contracts and route compatibility are preserved.
- [ ] Upload, generation, streaming, quiz, game, flashcard, and progress behavior remain correct.
- [ ] No secrets or backend-only business logic move into the frontend.
- [ ] Tauri native functionality is only used when an actual command/capability exists.
- [ ] Existing and newly added tests pass.

### Accessibility and performance
- [ ] Keyboard navigation and focus management work throughout.
- [ ] Contrast and touch targets are usable in both themes.
- [ ] Reduced-motion preference is respected.
- [ ] Blur, shadows, and animations do not create noticeable stutter.
- [ ] The production build works under the existing restrictive Tauri CSP.
- [ ] Desktop, tablet, and mobile layouts are usable.

---

## 16. Instruction to the implementation agent

Before writing UI code, inspect the current repository and map each real feature to its existing implementation and API contract. Then implement this design system in phases.

**Do not stop after redesigning the landing page.** The target is the entire frontend: shell, navigation, every feature screen, all interaction states, and responsive behavior.

**Do not rewrite the backend or simplify features to make the redesign easier.** Preserve behavior first; improve presentation and usability around it.

When a design decision conflicts with functional correctness, accessibility, security, Tauri compatibility, or performance, functional correctness wins. Find a visually consistent alternative rather than compromising the product.

The final result should feel like a carefully art-directed, premium learning application: cool, calm, tactile, luminous, and exceptionally easy to use.


---

## 17. Product expansion — Belajar as an all-in-one learning platform

This section expands the product beyond a personal AI study workspace into a broader education platform. The goal is to connect **learning, discovery, opportunity, community, identity, and play** in one coherent product.

These additions are product requirements and design direction, not permission to fabricate working functionality. Before implementing each feature, inspect the existing backend and integrations. If a required service or API does not exist, define and document the required contract and dependency; do not fake a production experience with hardcoded data.

### Expanded product pillars

1. **Learn** — personal study workspace, AI-powered materials, notes, mind maps, quizzes, flashcards, and progress.
2. **Discover** — scholarship opportunities, education news, competitions, events, internships, and curated learning resources.
3. **Connect** — student community, posts, short-form educational media, messaging, groups, and collaboration.
4. **Play** — educational mini-games, challenges, tournaments, and social learning activities.
5. **Grow** — learner profiles, portfolios, achievements, goals, and academic identity.
6. **Belong** — age- and education-appropriate experiences for elementary, junior secondary, senior secondary, and university learners.

The expanded product must remain understandable. Do not put every capability into the primary navigation at once. Use clear product pillars, contextual entry points, and role/education-aware navigation.

---

## 18. Expanded information architecture and navigation

Add the following destinations to the product architecture. The exact Indonesian labels can be refined during implementation, but keep them short and recognizable.

### Primary navigation

- **Beranda** — personalized bento dashboard.
- **Belajar** — materials, notes, mind maps, AI study tools, quizzes, flashcards, and progress.
- **Beasiswa & Peluang** — scholarships, competitions, events, internships, and education opportunities.
- **Komunitas** — feed, groups, discussions, creators, and messaging.
- **Game & Tantangan** — mini-games, daily challenges, learning tournaments, and game progress.

### Secondary / contextual destinations

- **Profil** — public learner profile and private account settings.
- **Pesan** — inbox and conversations, accessible from a persistent top-bar action.
- **Notifikasi** — replies, mentions, messages, group activity, scholarship deadlines, and learning reminders.
- **Pengaturan** — privacy, account, accessibility, appearance, notification controls, blocked users, and safety controls.
- **Pusat bantuan & keamanan** — reporting, moderation guidance, account safety, and support.

The primary navigation should adapt to the selected education environment and user role without hiding essential controls. Do not create duplicate destinations merely because a feature is reachable from multiple places.

---

## 19. Improved bento dashboard

The dashboard becomes the learner's personalized command center. Build a flexible **bento grid** with cards of varied size and hierarchy—not a rigid grid of equal metric tiles.

### Recommended dashboard composition

1. **Welcome / identity tile** — greeting, profile avatar, selected education environment, school/university name if supplied, and a concise personal learning goal.
2. **Continue learning (large feature tile)** — resume the most recent material, quiz, flashcard session, or course. Show accurate progress and one clear action.
3. **Scholarship spotlight (prominent tile)** — one or more relevant, verified scholarship opportunities with provider, eligibility snapshot, location/coverage, deadline, and application action.
4. **Daily learning pulse** — study time, streak, due reviews, weekly goal, or other metrics only when backed by real user data.
5. **For you / discovery tile** — relevant education news, competitions, events, or learning resources with clear source attribution.
6. **Community pulse** — selected posts, discussions, study groups, or questions from followed communities.
7. **Quick actions** — import material, ask AI, create a quiz, review flashcards, write a post, or explore scholarships.
8. **Mini-game / daily challenge tile** — a short learning activity with clear estimated duration only if known.
9. **Upcoming deadlines** — scholarship deadlines, event registrations, assignments, or personal reminders when connected to real data.

### Bento layout rules

- Use a responsive 12-column desktop grid with intentional card spans; collapse to fewer columns on tablet and a single-column or carefully prioritized layout on mobile.
- One or two featured tiles should establish hierarchy. Do not make every card equally loud.
- Use a combination of solid readable surfaces and selective frosted panels. Scholarship artwork or editorial imagery may add visual richness, but never place dense text over low-contrast images.
- Cards should be independently reorderable or dismissible only if the product persists those preferences.
- Provide a sensible default layout for new accounts and an honest empty state.
- Allow users to personalize visible modules when a real preference model exists; do not implement decorative drag handles without working reordering.
- Do not turn the dashboard into an infinite social feed. It should remain a useful starting point for learning and opportunities.

### Scholarship promotions on the dashboard

Scholarships should be presented as **relevant opportunities**, not intrusive advertisements.

- Prioritize eligibility and deadline relevance over paid placement.
- Clearly distinguish official scholarship listings, editorial recommendations, and sponsored placements.
- Sponsored content must be explicitly labeled and visually distinguishable.
- Never imply that Belajar guarantees acceptance, funding, or eligibility.
- Do not use manipulative countdowns or fake scarcity.
- Explain why an opportunity is being recommended when practical (education level, location, subject, eligibility).
- Let users dismiss a recommendation and manage scholarship interests.

---

## 20. Beasiswa & education news center

Create a dedicated opportunity and education discovery destination, with scholarships as a first-class feature.

### Scholarship discovery

Support a searchable and filterable scholarship directory with filters such as:

- Education level: elementary, junior secondary, senior secondary, diploma, undergraduate, postgraduate, and other levels only when the source supports them.
- Domestic / international destination.
- Country, region, or institution.
- Field of study / subject.
- Funding type: full, partial, tuition-only, stipend, exchange, or other source-defined categories.
- Eligibility requirements and applicant category.
- Application status: open, upcoming, closing soon, closed, or unverified.
- Deadline range and application period.

Each scholarship detail page should show:

- Official scholarship name and provider.
- Clear summary and benefits.
- Eligibility and exclusions.
- Supported education level and target applicant.
- Required documents.
- Opening and closing dates with timezone where relevant.
- Application steps and official application link.
- Source attribution, last-verified date, and verification status.
- Related opportunities and save/bookmark action.

### News and editorial content

Create an education news feed covering scholarships, admissions, school/university updates, research, competitions, policy changes, student achievements, and relevant education technology.

- Use editorial categories and search.
- Show publication date, publisher, author where available, and original source link.
- Distinguish original Belajar editorial content from externally sourced summaries.
- Respect copyright: use original summaries and short excerpts, not copied full articles.
- Clearly mark corrections, updates, and outdated information.
- Allow saving and sharing links.
- Provide topic and source preferences.

### Trust and verification requirements

Scholarship scams and outdated deadlines can harm users. Trust is a core feature, not a decorative badge.

- Prefer official provider pages, government portals, university websites, and recognized institutions.
- Store source URL, retrieval time, last verification time, and the identity/process used to verify a listing.
- Show a visible status such as **Verified source**, **Needs re-check**, or **Expired** with explanatory text.
- Do not call a listing verified solely because it appears on another aggregator.
- Never invent deadlines, eligibility, award amounts, or application links.
- Automatically flag expired listings for review and stop promoting them as open.
- Provide a user report flow for suspicious or inaccurate opportunities.
- Any automated summarization must retain links to the original source and must not silently change eligibility requirements.

---

## 21. Community — social learning platform

Build a learning-first social environment inspired by the usability patterns of modern social platforms, while maintaining a distinct Belajar identity. It should combine short-form discovery, meaningful discussion, study collaboration, and direct communication.

### Community feed

Support a feed with clearly differentiated content types:

- Text posts and questions.
- Image posts and carousels.
- Short-form vertical video / clips where upload and media delivery are supported.
- Study notes, diagrams, and learning-resource shares.
- Polls and knowledge checks.
- Event and study-group announcements.
- Long-form discussions and answers.

Core interactions:

- Like / react, comment, reply, bookmark, share, follow, mention, and report.
- Post creation with drafts, media preview, accessible alt text, and audience selection.
- Feed tabs such as **Untukmu**, **Mengikuti**, and **Grup** only when their ranking and data behavior are implemented.
- Search by topic, tag, creator, group, and post.
- Clear timestamps and edit indicators.
- Contextual post menus for edit, delete, report, mute, and block as appropriate.

### Short-form educational media

A vertical, swipeable discovery experience may be offered for educational clips, but it must not dominate the entire product.

- Prioritize educational context, creator identity, captions, and source links.
- Support captions/subtitles, playback controls, mute, pause, and reduced-motion/accessibility behavior.
- Do not autoplay audio unexpectedly.
- Provide a clear "not interested" and content-report action.
- Avoid manipulative infinite-scroll mechanics and engagement bait.
- Provide a way to open the full lesson, discussion, or referenced source.
- Apply upload size, duration, format, and moderation limits defined by the backend.

### Study groups and communities

- Public, private, and invite-only groups with clear visibility.
- Group description, education level, topics, rules, moderators, and member list.
- Discussion threads, pinned resources, shared study goals, and group events.
- Join requests and invitations where applicable.
- Role distinctions such as member, moderator, and owner.
- Clear leave, mute, report, and block behavior.
- Group discovery should prioritize relevance and safety, not raw member count.

### Direct messaging

Create a dedicated inbox and conversation experience.

- One-to-one messages and group conversations.
- Message requests from people the learner does not follow or know.
- Text, supported media, and shared Belajar resources.
- Read/delivery state only if reliably supported by the service.
- Reply, reactions, edit/delete windows, and message search where supported.
- Typing indicators and presence only when privacy settings and real-time infrastructure support them.
- Conversation mute, archive, block, report, and attachment safety controls.
- Clear loading, offline, failed-to-send, retry, and pending states.
- Prevent duplicate sends during retry or reconnection.

Do not expose a user's email, phone number, school records, private materials, or precise location through public profile or messaging defaults.

---

## 22. Learner profiles — academic identity and portfolio

Create profile pages that borrow useful conventions from professional networking platforms such as LinkedIn, but focus on learning, student projects, and academic interests.

### Public profile

Potential profile sections:

- Profile photo/avatar, display name, handle, and optional pronouns only if the user chooses to share them.
- Short biography and learning interests.
- Education environment and institution, with visibility controls.
- Subjects, skills, languages, and interests.
- Projects, portfolios, published notes, and shared learning resources.
- Achievements, badges, learning milestones, and selected progress highlights.
- Communities and study groups, subject to privacy.
- Posts and public contributions.
- Optional contact or external portfolio links.

### Profile actions

- Follow / unfollow.
- Message, subject to message-request and privacy rules.
- Share profile.
- Report or block.
- Edit profile and manage visibility.
- Pin selected projects or achievements.

### Privacy by design

- Every profile field must have an explicit visibility setting where appropriate: public, followers/connections, groups, or private.
- Do not make school, class, exact birth date, contact information, or learning history public by default.
- Never publicly expose quiz answers, private notes, AI conversations, or personal study files.
- Give users a preview of their profile as another person sees it.
- Provide account export and deletion pathways consistent with the backend's actual capabilities.

---

## 23. Education environments and age-aware experiences

Belajar should adapt its vocabulary, content presentation, discovery, safety, and learning experience to the learner's educational stage. Treat these as **education environments**, not merely theme presets.

### Environment types

1. **Elementary / Sekolah Dasar (SD)** — foundational learning, simple language, visual explanations, short sessions, basic subjects, and strong guardian/educator safety controls.
2. **Junior Secondary / SMP** — guided subject learning, exploration, collaborative study, structured challenges, and growing learner independence.
3. **Senior Secondary / SMA/SMK** — exam preparation, subject specialization, scholarship discovery, competitions, portfolios, and university/career exploration.
4. **University / Perguruan Tinggi** — advanced study workflows, research reading, citations, projects, academic communities, internships, scholarships, and professional portfolios.
5. **General / Lifelong Learning** — optional environment for independent learners, adult learners, and users outside the formal school structure.

Use localized Indonesian labels in the interface. The English descriptions above define the product categories, not necessarily the final UI copy.

### Environment behavior

Each environment may configure:

- Onboarding questions and suggested learning goals.
- Dashboard modules and content density.
- Recommended subjects, activities, games, and resources.
- Scholarship and opportunity filters.
- Community discovery defaults and group suggestions.
- Profile fields and portfolio emphasis.
- Language complexity, explanations, and learning-game difficulty.
- Age-appropriate content and communication restrictions.

Do not assume that every user in one education level has the same age, ability, needs, or curriculum. Let users select or correct their education context. Support transitions between levels without losing materials, achievements, history, or account identity.

### Account roles

Keep education level separate from account role. A user may be a learner, educator, parent/guardian, group moderator, or platform administrator; role permissions must be explicit.

- **Learner:** personal study, profile, community participation, and opportunities appropriate to their environment.
- **Educator:** classroom/group management and learning-resource sharing only where those capabilities are actually implemented.
- **Parent / Guardian:** limited safety and progress views only with appropriate authorization and consent.
- **Moderator:** scoped community moderation tools and audit trail.
- **Administrator:** privileged platform operations, never exposed through ordinary learner UI.

Do not build an educator or guardian control panel as a visual-only mockup. Role-based access must be enforced by the server, not merely hidden in React.

### Child and teen safety

Elementary and some junior-secondary users may be minors. Safety and privacy requirements must shape the architecture before social features launch.

- Determine the applicable age-assurance, parental-consent, and child privacy requirements for each launch region with qualified legal/product review.
- Do not collect more personal information than necessary.
- Apply age-appropriate defaults, content filtering, and communication restrictions.
- For child accounts, restrict unsolicited direct messages and adult-to-minor contact; define safe, reviewed communication rules before enabling messaging.
- Provide reporting, blocking, moderation queues, escalation, and appeal workflows.
- Do not expose precise location, school timetable, classroom, contact details, or real-time whereabouts.
- Do not use behavioral advertising or sensitive profiling of minors.
- Make guardian controls transparent and proportionate; do not silently expose private conversations or personal content.
- Add age-aware content policies to posts, comments, profiles, media, groups, recommendations, and AI responses.
- Ensure moderation is supported by operational processes, not just a report button.

---

## 24. AI assistant — cross-platform learning companion

Add a persistent AI assistant that works across Belajar, not just inside a single material's chat tab.

### Assistant capabilities

Subject to real backend support, the assistant may:

- Explain a concept at the learner's selected education level.
- Answer questions grounded in the current material or selected trusted sources.
- Summarize notes and explain difficult passages.
- Generate practice questions, flashcards, study plans, and revision checklists.
- Help identify weak concepts from actual learning history.
- Recommend relevant learning resources, scholarships, and events with source links.
- Help draft study notes, project outlines, and academic portfolios.
- Guide learners through mini-games and interactive exercises.
- Help users navigate Belajar features and understand how to use them.

### Assistant experience

- Provide a dedicated assistant destination plus contextual entry points throughout the app.
- Support a floating assistant launcher only if it does not obscure important controls or content.
- Clearly show the active context: current material, selected subject, profile environment, or general chat.
- Allow users to switch context and inspect which sources were used.
- Keep generated content editable before saving or publishing.
- Provide copy, insert into notes, create quiz, create flashcards, and save actions only when those actions have real implementations.
- Distinguish sourced facts, generated suggestions, and uncertain answers.
- Link to source documents for factual claims when retrieval is used.
- Never fabricate scholarship details, citations, exam results, or user progress.
- Do not publish or message on the user's behalf without an explicit confirmation step.
- Provide stop-generation, retry, and clear-conversation controls where supported.
- Respect user privacy and do not use private messages, private notes, or profile data as context without clear product policy and user control.

### Age-aware assistant behavior

The assistant should adapt explanations and tone to the selected education environment while preserving accuracy. It must not simply use babyish language for younger learners. Apply appropriate safety policies, avoid collecting sensitive personal information, and provide safe escalation guidance for harmful or urgent disclosures.

---

## 25. Mini-games and gamified learning

Expand the existing learning games into a broader mini-game library. Games must reinforce learning rather than become unrelated time sinks.

### Game categories

- **Quick recall:** timed recall, flashcard races, concept matching.
- **Knowledge puzzles:** word/term puzzles, sequence ordering, diagram labeling, logic challenges.
- **Error detective:** identify misconceptions, correct flawed explanations, and explain why.
- **Scenario challenges:** apply a concept to a real-world situation.
- **Competitive practice:** asynchronous challenges, friend/group leaderboards, and tournaments where safe and supported.
- **Creative learning:** build a concept map, explain a topic, or assemble a solution from clues.

### Game UX

- A game library with categories, difficulty, subject, estimated session length where known, and learning objective.
- Clear rules and controls before starting.
- Short sessions with pause/resume where appropriate.
- Accessible keyboard, touch, and reduced-motion behavior.
- Clear feedback and explanations after an answer.
- Progress and rewards that reflect actual learning, not merely time spent.
- Daily/weekly challenges with transparent reset times and rules.
- Optional social competition with privacy controls and age-appropriate matchmaking.
- Avoid pay-to-win mechanics, loot-box patterns, manipulative streak pressure, or rewards that encourage compulsive use.

### Learning integrity

- Track learning outcomes separately from entertainment points.
- Do not award mastery solely for opening a game or clicking through answers.
- Use authoritative answer keys or validated evaluation logic.
- Keep score calculations server-authoritative where competitive integrity matters.
- Preserve accessibility and provide a non-timed alternative where timing is not pedagogically essential.

---

## 26. Notifications, discovery, and personalization

A unified notification center should bring together:

- New direct messages and message requests.
- Replies, mentions, reactions, and follows.
- Group invitations and study activity.
- Scholarship deadlines and saved-opportunity updates.
- Events and competition reminders.
- Flashcard reviews, study goals, and learning streak reminders.
- AI task completion or processing failures where relevant.

Rules:

- Let users configure notification categories and delivery channels.
- Avoid sending repeated or low-value notifications.
- Provide quiet hours and digest options if the delivery infrastructure supports them.
- Never expose sensitive message content in lock-screen notifications by default.
- Make notification actions deep-link to the correct destination.
- Do not claim push notification support until platform permissions and delivery infrastructure are implemented.

Personalization may use declared interests, selected education environment, saved topics, and explicit user preferences. Explain controls, allow reset, and avoid opaque sensitive profiling.

---

## 27. Backend, data, and service boundaries for the expanded platform

The new social and discovery features are materially larger than the current learning frontend. Treat them as separate product domains with explicit service contracts.

Potential backend domains to design and validate:

- Identity, profiles, roles, education environments, and privacy preferences.
- Scholarship and opportunity ingestion, verification, search, and saved listings.
- News/article ingestion, editorial summaries, and source attribution.
- Posts, comments, reactions, follows, feeds, and media metadata.
- Direct messaging, conversations, message requests, and real-time delivery.
- Groups, membership, invitations, and moderation.
- Media upload, transcoding, storage, and delivery.
- Mini-game catalog, sessions, scoring, challenges, and leaderboards.
- AI assistant sessions, context selection, retrieval, and tool permissions.
- Notifications, preferences, and delivery.
- Reporting, blocking, moderation queues, and audit events.

These are domain boundaries to plan—not a claim that these APIs already exist.

### Engineering requirements

- Define typed request/response contracts before connecting UI.
- Use server-side authorization for every private resource and action.
- Enforce ownership and visibility checks on profiles, posts, files, messages, and groups.
- Validate uploads by MIME type, actual file signature, size, duration, and safe processing policy.
- Use signed/authorized media access where appropriate; do not expose private storage paths.
- Add rate limits, spam prevention, abuse detection, and idempotency for social actions.
- Use pagination/cursors for feeds, messages, comments, and opportunity lists.
- Use real-time transport only where required; provide polling or refresh fallback if appropriate.
- Design moderation, report handling, account suspension, and appeals before opening public community access.
- Establish data retention and deletion behavior for accounts, messages, media, and moderation records.
- Keep secrets and privileged integrations on the server.
- Add observability for failed ingestion, message delivery, moderation backlog, and notification delivery.
- Avoid coupling the frontend to a single third-party feed, chat, or AI provider.

Do not attempt to implement all of these services inside the Tauri Rust shell. Tauri remains the client container; the platform backend owns shared identity, social data, opportunity data, authorization, and cross-device synchronization.

---

## 28. Expanded implementation roadmap

The new scope should be delivered in product increments. Do not attempt to ship a full social network, scholarship aggregator, and AI platform in one frontend rewrite.

### Phase 7 — Product foundations and education environments
- Define user identity, education level, role, onboarding, and privacy preferences.
- Design the environment selector and environment-aware navigation.
- Implement profile foundations and privacy settings.
- Validate age-aware defaults and role authorization requirements before social launch.

### Phase 8 — Scholarship and education discovery
- Define trusted source ingestion and scholarship data contracts.
- Build scholarship directory, detail page, filters, saved opportunities, and deadline states.
- Build education news and editorial discovery.
- Add source attribution, verification status, expiration handling, and report flow.
- Integrate selected opportunity modules into the bento dashboard.

### Phase 9 — AI assistant
- Define assistant sessions, context selection, retrieval, and permitted actions.
- Build dedicated assistant UI and contextual assistant entry points.
- Implement grounded responses, source display, safe save/insert actions, and age-aware behavior.
- Verify privacy boundaries and prevent accidental publication or external actions.

### Phase 10 — Community foundations
- Build public learner profiles and privacy controls.
- Implement posts, comments, reactions, follows, bookmarks, and feed pagination.
- Add groups and moderation workflows.
- Launch only after server-side authorization, reporting, blocking, rate limits, and moderation operations are ready.

### Phase 11 — Messaging and media
- Implement inbox, message requests, one-to-one and group conversations.
- Add real-time delivery and recovery behavior if supported by infrastructure.
- Implement safe media upload and delivery, captions, and reporting.
- Validate minor-safety restrictions and privacy defaults before enabling direct messages broadly.

### Phase 12 — Mini-games and social learning
- Expand the mini-game catalog and game session framework.
- Add daily challenges, asynchronous friend/group challenges, and leaderboards where appropriate.
- Validate scoring integrity and learning outcomes.
- Add accessibility and age-aware matchmaking/safety.

### Phase 13 — Notifications and personalization
- Implement unified in-app notifications and preference controls.
- Add relevant discovery modules and dashboard personalization.
- Add optional push/email delivery only after infrastructure, consent, and platform support are ready.

### Phase 14 — Platform quality and launch readiness
- Security review for authentication, authorization, file/media access, messaging, and profile privacy.
- Moderation readiness review and abuse-response procedures.
- Privacy and child-safety review for launch markets.
- Performance tests for feed scrolling, media, chat, and dashboard modules.
- Full desktop, web, tablet, and mobile Tauri validation.
- Accessibility review and localization quality pass.

The original phases 0–6 remain the foundation. New platform domains must not delay stabilizing the core learning experience; work can be staged and feature-flagged.

---

## 29. Expanded acceptance criteria

### Discovery and scholarships
- [ ] Users can discover and filter opportunities using supported eligibility fields.
- [ ] Every listing displays a source and a meaningful verification/expiry state.
- [ ] Expired or suspicious listings are not presented as currently open.
- [ ] Sponsored placements are labeled and cannot masquerade as verified editorial recommendations.
- [ ] Dashboard scholarship modules reflect relevant, real opportunities.

### Community and messaging
- [ ] Users can create, edit, delete, report, and interact with supported post types.
- [ ] Feed pagination and loading/error states work without duplicate content.
- [ ] Profiles, posts, groups, and messages obey server-enforced visibility rules.
- [ ] Users can block/report and control message requests.
- [ ] Message delivery, retry, and offline states are honest and recoverable.
- [ ] Media is validated, safely processed, and served according to access permissions.
- [ ] Moderation operations and escalation workflows exist before public community launch.

### Profiles and education environments
- [ ] Learners can choose and update their education environment.
- [ ] Switching environments does not erase learning history or identity.
- [ ] Profile visibility is configurable and private by default for sensitive fields.
- [ ] Role-based features are enforced by the backend.
- [ ] Child and teen safety controls are reviewed before relevant social features are enabled.

### AI assistant and mini-games
- [ ] Assistant context and sources are visible to the learner.
- [ ] AI-generated content is never silently published or saved as user-authored work.
- [ ] Assistant actions require confirmation where they create external or public effects.
- [ ] Games explain learning objectives, rules, and feedback.
- [ ] Scoring and mastery are not conflated.
- [ ] Social competition is optional, privacy-aware, and age-appropriate.

### Platform quality
- [ ] Dashboard modules are useful, responsive, and backed by real data.
- [ ] Notifications respect user preferences and do not leak private content.
- [ ] New backend domains have typed contracts, authorization, validation, and tests.
- [ ] All new experiences work with the established Frost UI system.
- [ ] No feature is represented as operational until its service contract and end-to-end behavior are implemented.

---

## 30. Competitive product direction

Belajar may study the strengths and interaction patterns of products such as Pelajarin.ai, Pintarly, LinkedIn, Instagram, and TikTok, but must not copy their branding, layouts, or proprietary presentation.

The product should differentiate through the **connection between learning and real student outcomes**:

- A material can become notes, a mind map, quizzes, flashcards, games, and measurable mastery.
- A learner's interests and education environment can surface relevant scholarships, competitions, and academic opportunities.
- Community discussions can connect directly to study materials, collaborative groups, and learning challenges.
- A profile can represent projects, skills, learning milestones, and academic contributions—not just social popularity.
- The AI assistant can help users move between discovery, study, practice, and portfolio creation with transparent context and sources.

Do not claim Stuby is better than a competitor through marketing copy alone. Build measurable advantages: reliable scholarship data, excellent learning workflows, safe and useful community tools, meaningful personalization, accessibility, and a fast, cohesive cross-platform experience.

**Product north star:** help every learner discover what they can achieve, learn what they need, connect with people who help them grow, and demonstrate what they have accomplished.


---

## 31. Revision: liquid-glass material (supersedes the starting values in §3 and §4)

The palette in §3 was explicitly a *starting* palette. Building the real screens led to a **liquid-glass**
direction (reference: translucent capsules over a soft sky-to-apricot backdrop). `app/src/styles/tokens.css`
is the source of truth; the notes below explain the decisions so they are not undone by accident.

- **One backdrop, `--wallpaper`** (sky blue, lilac, apricot; deep navy, violet, ember in dark). Glass needs
  something chromatic behind it; on a flat canvas it reads as grey paper. It is fixed (`body::before`).
- **Cards are tint + rim + inner highlight, with no blur.** Over a smooth backdrop a blur changes nothing and
  costs GPU on every tile. `backdrop-filter` is only for layers content passes underneath: top bar, floating
  mobile nav, dialogs, toasts. (This is also how §2's "blur only where it communicates layering" is kept.)
- **Text colours are contrast-checked** (>= 4.5:1) against the lightest and darkest glass/backdrop pairs in both
  themes; the accent and status colours are text colours too, so the light-theme values are darker than §3's.
  Re-check before lightening anything. `--on-accent` is the label colour on accent/danger fills (dark ink in
  dark mode, where the accent is light).
- **Radii:** controls 14, cards 20, sheets 28. Capsules are reserved for the floating nav, its lens, search and chips.
- **Floating mobile nav:** five equal columns, so the active "lens" is positioned with pure CSS (`--idx`);
  it slides on a spring and stretches toward its destination. Reduced motion keeps a short plain slide.
- **Do not hand-write `-webkit-backdrop-filter`** next to `backdrop-filter`: the CSS minifier then drops the
  standard property, and Chrome/WebView2 lose the blur in production builds. The build adds the prefix itself.
- **Reduced motion** is honoured, and note that Windows with "Show animations in Windows" off reports it too.
