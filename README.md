# Stuby

**Turn your own study material into notes, quizzes, flashcards and games, and keep the habit going.**

Stuby is a personal learning platform. Upload a PDF, slide deck, document or image; AI turns it into structured notes, a mind map, quizzes and spaced-repetition cards. Progress, streaks and mastery tracking show what to review next. One codebase ships as a standalone desktop app, a self-hosted web app and an Android app.

![Rust](https://img.shields.io/badge/backend-Rust-b7410e) ![React](https://img.shields.io/badge/client-React%2019-149eca) ![Tauri](https://img.shields.io/badge/shell-Tauri%202-24c8db) ![Postgres](https://img.shields.io/badge/data-PostgreSQL%20%2F%20Supabase-3ecf8e) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## Why Stuby

| Advantage | What it means |
|---|---|
| **Your material, not generic content** | Everything is generated from files you upload, with the source page or slide cited on questions. |
| **A complete study loop** | Read, test, review, play and track in one place: notes, quizzes, flashcards, games and progress share one model of what you know. |
| **Honest learning data** | Mastery, streaks and weak topics come from real answers. Empty states say "no data yet", never a fake zero. |
| **Runs where you want** | The desktop app embeds its own server (nothing to start first). The same server runs on Linux for web and mobile clients. |
| **Fast and light** | Rust server and Tauri shell instead of a bundled browser runtime; the React client is code-split per feature. |
| **Private by design** | Per-owner row-level security in the database, a restricted DB role, no secrets compiled into the app, strict CSP. |
| **Accessible UI** | Keyboard and screen-reader support throughout, reduced-motion paths, contrast-checked light and dark themes. |

## Core functionality

| Area | What you get |
|---|---|
| **Library** | Upload PDF, DOCX, PPTX, images, TXT and MD (up to 40 MB). Group by subject. A background pipeline extracts text, reads image-only pages with a vision model and chunks long documents; failed chunks retry without redoing the rest. |
| **AI notes** | Eight styles: general (concise, Cornell, simple) and detailed (Sentence, Charting, Outline, Worked Examples). Markdown with LaTeX math and code cards; editable, downloadable, regenerable. |
| **Ask and chat** | Select text in a note to ask about it; per-document chat with streamed answers and persistent history. |
| **Mind maps** | AI-built concept trees with cross-links; pan, zoom, collapse, list view, export to SVG/PNG, jump back to the source note. |
| **Quizzes** | Multiple choice, true/false and short answer, spread evenly across the material. Practice mode (instant feedback) and exam mode (timer, survives reload). Short answers are graded locally first, with AI only for uncertain cases. |
| **Weak questions** | Anything you last got wrong is queued for review. |
| **Flashcards** | SM-2 spaced repetition built from concepts and games, with Anki-compatible TSV export. |
| **Games** | Six AI-guided modes (teach-back, spot-the-error, branching adventure, real-world case, rapid-fire, boss exam). The server is the referee: answer keys never reach the browser before judging and AI output is treated as untrusted. |
| **Mastery** | Per-concept score updated from evidence of different kinds; a concept counts as mastered only with enough, varied proof. |
| **Progress** | Daily streak with freezes, 20-week activity map, weekly goal, scores per quiz and topic, study time. |
| **Opportunities** | Scholarships and competitions matched to your learning environment, with saved deadlines. |
| **Learning environment** | Pick your level (primary to professional); copy, pacing and suggestions adapt. |
| **Banner slots** | Three configurable promo/ad placements (hero carousel, side card, strip), labelled "Promo" or "Iklan" for transparency. |

## Interface

- **The panda's palette.** Colours come from the logo: ink, bamboo green, cream, with one sun-yellow accent. Primary things carry the logo's heavy outline and a hard shadow; everything else is flat and hairline. Light and dark share one token set (`app/src/styles/tokens.css`).
- **One glass element.** The floating dock is the only blurred surface; cards, menus, dialogs and the top bar are solid.
- **Floating dock instead of a sidebar.** On desktop it shows every destination at once. On a phone it is five tabs: tap to go, or hold a tab and its related pages rise out of it (slide onto one and release to open; keyboard: `ArrowUp`). It hides when idle and returns on scroll, touch, the bottom edge or the keyboard.
- **Phone layout.** No top bar; the home screen is its own composition (a focal "today" card, a sideways scroller, an inline stat strip, a column chart), not the desktop grid squeezed narrow.
- **Startup screen.** An animated panda while the app really does the work: reach the server, check your session, load your first screens.
- **Languages.** English (default), Bahasa Indonesia, Español and 中文 (简体), chosen in Settings and remembered per device. The shell, dashboard, Settings and login are fully translated; other pages are being migrated and show Indonesian meanwhile. To translate a screen, wrap its text in `t('…')` and add a row to `app/src/services/i18n/messages.ts` (a test fails if a row is missing a language or a placeholder).

## Architecture

```
React 19 + Vite client (app/)  ─┬─ Tauri 2 desktop shell ── embeds ─┐
                                ├─ Browser (self-hosted)             │
                                └─ Tauri Android shell (remote UI)   ▼
                                                        stuby-server (axum, single origin: UI + API)
                                                                  │
                      ┌───────────────────────────────────────────┼───────────────────────┐
                      ▼                                           ▼                       ▼
               stuby-application                             stuby-ai               stuby-storage
        workflows, job queue, handlers                AI gateway client          sqlx + PostgreSQL (Supabase)
                      │                         (levels, retries, streaming,     row-level security per owner
                      ▼                              JSON repair)
                 stuby-core
     pure learning logic: grading, SM-2, mastery,
     stats, streaks (no I/O; golden-tested)
```

| Crate | Responsibility |
|---|---|
| `stuby-core` | Deterministic learning logic with no I/O; checked against golden files recorded from the original implementation. |
| `stuby-storage` | PostgreSQL access, versioned migrations, sessions, row-level security. |
| `stuby-ai` | AI gateway client: model levels, retries, sessions, streaming, structured-output repair. |
| `stuby-application` | Use cases and action handlers; background jobs for document processing. |
| `stuby-api` | HTTP surface: `/api/v1` plus the compatible RPC routes the client uses. |
| `stuby-server` | Server binary and library (embedded by the desktop app). |
| `stuby-devdb` | Local embedded PostgreSQL for development and tests (not shipped). |

## Platforms

| Platform | How it works |
|---|---|
| **Windows / macOS / Linux desktop** | Standalone: the app starts its own server on a loopback port and shows it. First launch shows a setup screen (database address and a password), so there is no file to edit by hand. |
| **Web / Linux server** | `deploy/linux/install.sh` builds and installs a hardened systemd service; put Caddy in front for HTTPS. |
| **Android** | Tauri shell that loads the UI from your server's address, so session cookies stay on one origin. |

## Quick start

Prerequisites: Rust (pinned in `rust-toolchain.toml`), Node.js 22+, and on Windows the MSVC Build Tools and WebView2. A PostgreSQL database is required: a Supabase project, or the local one from `stuby-devdb`.

```bash
npm install                      # root postinstall installs app/
cargo run -p stuby-server        # API on http://127.0.0.1:8080 (needs DATABASE_URL, APP_PASSWORD)
npm run dev:react                # web client on http://localhost:5173, proxies /api to :8080
npm run tauri:dev                # desktop app in dev mode
```

### Try it without building

You do not need an installer to see a change. Pick one:

| Command | What you get |
|---|---|
| `npm run dev:mock` | The whole UI in the browser at http://localhost:5173 with **fictional data and no database or server**. Hot reload, instant. Best for styling and layout work. |
| `npm run server` + `npm run dev:react` in two terminals | The real UI with hot reload against your real server and database (Vite proxies `/api`, so login works). |
| `npm run tauri:dev` | A native window around the server-served UI (run `npm run build:standalone` in `app/` first). |

For phone layouts, open the browser dev tools, toggle the device toolbar (Ctrl+Shift+M) and use a touch device: the hold-to-open tab menu works with touch emulation. Only the embedded-server startup of the desktop app needs a real build.

Build installers:

```bash
cd app
node scripts/build-desktop.cjs                                  # standalone desktop installer (NSIS)
node scripts/build-android.cjs --server https://stuby.example.org   # Android APK pointed at your server
```

Serve the web client from the server: `npm run build:standalone` in `app/`, then `STATIC_DIR=app/dist cargo run -p stuby-server`. Always use `build:standalone` for bundles the Stuby server itself serves; plain `build` bakes in the dev API address.

### Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | **Required.** PostgreSQL connection (Supabase session pooler, restricted role). |
| `APP_PASSWORD` / `APP_PASSWORD_HASH` | Owner login (plain, or an Argon2 hash). One is required. |
| `HOST`, `PORT` | Listen address (default `127.0.0.1:8080`). |
| `STATIC_DIR`, `FILES_DIR` | Built web UI and uploaded files. |
| `SESSION_DAYS`, `MAX_UPLOAD_MB`, `JOB_WORKERS` | Session length (30), upload limit (40), background workers (2). |
| `TIMEZONE`, `DAY_START_HOUR` | Day boundaries for streaks (default `Asia/Jakarta`, `0`). |
| `COOKIE_SECURE`, `TRUST_PROXY` | Set to `1` behind HTTPS and a reverse proxy. |

The desktop app reads the same settings from `stuby.env` in its config folder (it tells you where on first launch). Details: [`docs/DESKTOP_STANDALONE.md`](docs/DESKTOP_STANDALONE.md), [`docs/LINUX_SERVER_SETUP.md`](docs/LINUX_SERVER_SETUP.md).

## Security and privacy

- Login with a password; sessions are stored server-side and carried in `SameSite=Strict` cookies. The password can be configured as an Argon2 hash.
- The server connects as a restricted database role. Row-level security is enabled on every table and forced on data tables, so queries only see the owner's rows.
- No secrets are compiled into any binary; they live in the environment or in `stuby.env` on your machine.
- Strict Content-Security-Policy in the app shell; user content is sanitised before rendering.
- AI output is validated and treated as untrusted data; game answer keys stay on the server until a turn is judged.

## Quality

```bash
npm run check          # rustfmt, clippy (warnings denied), Rust tests, client build, client tests
cargo test --workspace
npm test               # ~590 client tests (components, features, accessibility, end-to-end flows)
```

Tests that need PostgreSQL provision a throwaway database through `stuby-devdb`.

## Project layout

```
crates/   Rust workspace (core, storage, ai, application, api, server, devdb)
app/      React client, Tauri shell (app/src-tauri), build scripts
deploy/   Linux systemd service, Caddyfile, installer
docs/     Architecture, setup guides, migration plan, feature inventory
parity/   Golden files that pin the Rust logic to the original behaviour
```

The repository also keeps the original Python/Node implementation (repository root, `server/`, `tests/`) as a frozen reference until it is retired. It is not part of the product.

## Status and limits

- Community, direct messages, notifications and the cross-material AI assistant are visible as "coming soon"; they have no backend yet.
- One owner per server instance. The desktop app is single-user, single-machine.
- Generating notes, quizzes and games needs a reachable AI gateway. Already-generated material, flashcards and progress keep working without one.
- Legacy `.doc` and `.ppt` files are not supported (re-save as `.docx` / `.pptx`).
- iOS is not built yet.

## Documentation

[`docs/ARCHITECTURE_AUDIT.md`](docs/ARCHITECTURE_AUDIT.md) · [`docs/FEATURE_INVENTORY.md`](docs/FEATURE_INVENTORY.md) · [`docs/MIGRATION_PLAN.md`](docs/MIGRATION_PLAN.md) · [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) · [`docs/TECHNICAL_RISKS.md`](docs/TECHNICAL_RISKS.md) · [`design.md`](design.md) · [`CHANGELOG.md`](CHANGELOG.md)

## License

MIT. See [`LICENSE`](LICENSE).
