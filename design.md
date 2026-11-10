# Belajar — Frontend Design System & Redesign Specification

> **Purpose:** This is the implementation brief for a complete visual and interaction redesign of the Belajar client. Treat it as the product-level source of truth for the frontend overhaul. The goal is a cohesive, premium **Frost UI** experience—not a superficial coat of glass effects.
>
> **Scope:** React frontend in `app/src/`, shared by the web client and the Tauri 2 desktop/mobile shell. This document describes the target experience and implementation constraints; it does not authorize changes to the Python agent, Node server, API contracts, database, AI prompts, or learning/scoring logic.

---

## 1. Product understanding

Belajar is a personal AI-powered learning workspace. A learner imports their own study materials, turns them into structured notes and mind maps, chats with AI about the material, practices quizzes, plays AI-guided learning games, reviews spaced-repetition cards, and tracks learning progress.

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
