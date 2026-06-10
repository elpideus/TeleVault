# TeleVault — Contributor TODO

This file is the canonical list of improvements and missing features, ordered by importance and urgency. Every item includes enough context for a new contributor to understand *why* it matters and *where* to start.

---

## Legend

| Priority | Meaning |
|----------|---------|
| 🔴 **Critical** | Security issue or data-loss risk — fix before anything else |
| 🟠 **High** | Core UX or reliability gap that affects most users daily |
| 🟡 **Medium** | Meaningful improvement, but the app is usable without it |
| 🟢 **Low** | Nice-to-have polish or future-facing work |

---

## 🔴 Critical

### 1. In-memory upload session state leaks memory and is lost on restart

**Files:** `backend/app/api/files.py` — module-level dicts `_chunked_uploads` (line 301) and `_tus_uploads` (line 318)

These dicts grow forever when uploads are abandoned (e.g. browser closes mid-upload). They are also wiped on every server restart, orphaning the pre-allocated temp files. In a multi-worker deployment they are not shared between workers at all, so clients may hit the wrong worker and get a 404.

**Fix:** Move upload session state to the database (a new `upload_sessions` table) or to Redis. Add a background task that purges sessions older than N hours and deletes their temp files.

---

### 2. No rate limiting on authentication or upload endpoints

**Files:** `backend/app/api/auth.py`, `backend/app/api/files.py`

The phone-login and OTP endpoints have no rate limiting, enabling brute-force OTP attacks. Upload endpoints have no throttle either, making denial-of-service trivial.

**Fix:** Add a rate-limiting middleware (e.g. `slowapi` for FastAPI). Apply strict limits to `/api/v1/auth/phone` and `/api/v1/auth/otp` (e.g. 5 req/min per IP), and per-user limits on upload endpoints.

---

### 3. No test suite

There are zero unit or integration tests. Changes to core logic (upload pipeline, auth, file deduplication) cannot be verified automatically, making contributions risky.

**Fix:** Add `pytest` + `httpx` (async) integration tests for:
- Auth flow (phone → OTP → JWT issue → refresh → logout)
- File upload, download, rename, move, copy, delete
- Folder CRUD
- Deduplication (hash check)
- Upload cancellation

Use a test PostgreSQL container via `pytest-asyncio` + Docker or `testcontainers-python`. Backend `pyproject.toml` already has the right Python target (`>=3.12`).

---

## 🟠 High

### 4. File previews / thumbnails are completely missing

**Files:** `frontend/src/themes/default/components/FileCard.tsx`, `FileDetails.tsx`

Thumbnails and in-browser previews are listed in the README "Coming Soon" section but not started. Users cannot preview images, PDFs, videos, or audio without downloading them first.

**Design decision:** Thumbnails are generated **eagerly on upload** (not lazily). Pillow and ffmpeg are bundled in the Docker image — no feature flag needed. The added image size (~80 MB) is an acceptable trade-off for zero-config thumbnail support.

**Fix:**
- Backend: After `execute_upload` completes successfully, dispatch a background task that generates a thumbnail and saves it under `static/thumbnails/{file_id}.webp`. Use `Pillow` for images and `ffmpeg` (via `subprocess` or `ffmpeg-python`) for video frame extraction. Add `GET /api/v1/files/{file_id}/thumbnail` (auth required, streams the cached `.webp`). Add `Pillow` and `ffmpeg-python` to `pyproject.toml`; install `ffmpeg` binary in `backend/Dockerfile`.
- Frontend: Show `<img>` thumbnails in `FileCard.tsx` and `FileRow.tsx` for known image/video MIME types (use `useAuthenticatedImage` hook which already exists at `src/hooks/useAuthenticatedImage.ts`). Add a preview modal (lightbox) for images, `<video>` / `<audio>` for media, and a `<iframe>`/embed for PDFs.

---

### 5. File and folder sharing is not implemented

There is no way to share a file or folder with another person via a public link.

**Design decision:** Sharing is public-link only (no user-to-user sharing). Links should support an optional expiry date and an optional max-download count.

**Fix:**
- Backend: Add a `share_tokens` table (`id`, `file_id`/`folder_id`, `owner_id`, `token`, `expires_at` nullable, `max_downloads` nullable, `download_count`). Add `POST /api/v1/share` (auth required) and `GET /api/v1/share/{token}` (public, no auth) endpoints. `GET /api/v1/share/{token}` streams the file directly if it's a file, or returns a folder listing JSON if it's a folder.
- Frontend: Add "Share" option to `FileContextMenu.tsx` and `FolderContextMenu.tsx`. On click, open a small popover with an expiry date picker and a max-downloads field (both optional), then copy the generated link to the clipboard.

---

### 6. Command palette (`CommandPalette.tsx`) is not wired to real actions

**Files:** `frontend/src/themes/default/components/CommandPalette.tsx`

The component exists but the action registry is incomplete — most commands are no-ops. The component is listed in the codebase but not consistently reachable via keyboard shortcut in all contexts.

**Fix:** Implement a full command registry (search files, navigate to folder, open settings panels, toggle view mode, upload, logout). Wire `Ctrl+K` / `⌘K` globally via `useKeybinds`.

---

### 7. Chunked upload temp files are not cleaned up on server restart

**Files:** `backend/app/main.py` — `_cleanup_stale_uploads()` only deletes DB rows, not the temp files on disk.

After a crash, pre-allocated temp files (which can be multiple GB) remain in the OS temp directory indefinitely.

**Fix:** Store the `tmp_path` in the `upload_sessions` table (see item 1). On startup, delete both the DB row and the file on disk for any session older than 1 hour.

---

### 8. Per-folder Telegram channel routing is not implemented

**Files:** `backend/app/services/upload.py` — `resolve_channel()` always falls back to the default channel.

The README lists this as a coming feature. Without it, all files go to the same channel regardless of folder, which makes organizing large vaults harder and can push single channels toward Telegram's limits.

**Fix:**
- DB: Add `preferred_channel_id` (nullable FK) to the `folders` table.
- Backend: `resolve_channel()` should walk up the folder tree to find the nearest ancestor with a `preferred_channel_id` set, falling back to the user's default channel.
- Frontend: Add a channel selector in the `NewFolderModal` and `PropertiesModal` (`frontend/src/themes/default/components/`).

---

### 9. No mobile / responsive layout

The frontend assumes a desktop viewport. On phones and tablets the sidebar, breadcrumb, and file grid break.

**Fix:** Add responsive breakpoints in the Tailwind config. The sidebar should collapse to a bottom sheet or hamburger menu on narrow screens. File grid should switch to single-column. Touch-friendly tap targets for selection.

---

### 10. Database host is hardcoded to `127.0.0.1`

**Files:** `backend/app/core/config.py` line 98

When `DATABASE_URL` is not provided, the auto-built URL always connects to `127.0.0.1:5432`. This prevents any external PostgreSQL setup that is not on the same host.

**Fix:** Add a `POSTGRES_HOST` and `POSTGRES_PORT` setting (defaulting to `127.0.0.1` and `5432`) and use them in `build_database_url`.

---

## 🟡 Medium

### 11. Themes and accent color customization not implemented

**Files:** `frontend/src/store/themeStore.ts`, `frontend/src/themes/`

`VITE_THEME` build arg selects a theme at *build time* — there is no runtime theme switcher. The `themeStore` exists but accent color application is incomplete in the Settings UI.

**Design decision:** A **bundled dark mode** ships with the app (no community theme packages needed initially). The theme switcher should toggle between light and dark at runtime without a rebuild.

**Fix:** Define dark-mode CSS variables in a `:root[data-theme="dark"]` block. Add a `theme: "light" | "dark"` field to `themeStore`. Wire the toggle to a switch in `SettingsPanels.tsx`. Accent color picker should write to a `--tv-accent` CSS variable at runtime. Persist both values via server-side preferences (see item 19) so the chosen theme follows the user across devices.

---

### 12. Custom keybinds are defined but not user-configurable

**Files:** `frontend/src/lib/keybinds.ts`, `frontend/src/store/keybindStore.ts`, `frontend/src/themes/default/components/SettingsPanels.tsx`

The keybind infrastructure exists and the Settings panel renders key chips, but users cannot actually rebind actions — the UI is read-only display only.

**Fix:** Make the keybind rows in `SettingsPanels.tsx` editable (click to capture a new keypress). Persist custom bindings in `localStorage` via `keybindStore`.

---

### 13. Data import and export are missing

There is no way to export file metadata or migrate a vault to another TeleVault instance. Contributors listed this as planned.

**Design decision:** Export format is a **JSON manifest only** (no re-downloading files from Telegram). The manifest is sufficient to reconstruct the database on another TeleVault install that has access to the same Telegram account.

**Fix:**
- Export: `GET /api/v1/export` (auth required) returns a JSON file containing the full folder tree, file records (name, size, hash, MIME type, created_at), and the Telegram message IDs for each split. Served with `Content-Disposition: attachment; filename="televault-export-{date}.json"`.
- Import: `POST /api/v1/import` accepts the manifest JSON, validates that the Telegram account matches, and upserts folders and file records. Skips records whose `file_hash` already exists (idempotent). Reports how many items were created vs. skipped.
- Frontend: Add "Export vault" and "Import vault" buttons in the Settings modal under a new "Data" panel.

---

### 14. No HTTPS / TLS setup documentation or Let's Encrypt helper

The README only covers HTTP. Users running TeleVault on a public IP have no guide for TLS termination. This is especially relevant because Telegram OTP credentials flow through the same server.

**Fix:** Add a `HTTPS.md` or expand the README with:
- Nginx TLS config with Let's Encrypt (Certbot) example
- Caddy one-liner as an alternative
- Note about setting `CORS_ORIGINS` correctly after enabling HTTPS

---

### 15. `_sanitize_filename` is too aggressive — Unicode filenames become garbled

**Files:** `backend/app/api/files.py` lines 333–347

The sanitizer replaces every non-ASCII-alphanumeric character with `_`, turning `résumé.pdf` into `r_sum_.pdf` and CJK filenames into `upload.ext`.

**Fix:** Replace the regex with a Unicode-aware approach: strip control characters and filesystem-unsafe characters (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, null byte) only, leaving Unicode letters and digits intact. Use `unicodedata.normalize` to handle composed/decomposed forms.

---

### 16. Storage and bandwidth limits are not configurable

The README lists "custom storage and bandwidth limits" as coming soon. Currently any user can upload unlimited data.

**Design decision:** Quota enforcement is user-configurable per account. The default behavior is a soft warning (banner in the UI) that still allows the upload to proceed. A hard-reject mode (HTTP 507) should also be available as an admin-settable option per user.

**Fix:**
- Add `storage_quota_bytes` (nullable) and `quota_hard_limit` (boolean, default `false`) to the `users` table.
- In `prepare_upload` (`backend/app/services/upload.py`), check `get_user_stats()` against the quota. If `quota_hard_limit` is `true`, raise HTTP 507. Otherwise, allow the upload but include a `"quota_exceeded": true` flag in the `FileUploadOut` response so the frontend can show a warning banner.
- Expose quota info (`storage_quota_bytes`, `quota_used_bytes`, `quota_hard_limit`) in `GET /api/v1/auth/me` so the frontend can render the `StorageIndicator` component accurately.
- Admin endpoint to set per-user quotas and toggle hard/soft enforcement.

---

### 17. Activity feed / audit log is in the UI but only partially populated

**Files:** `frontend/src/themes/default/components/ActivityFeed.tsx`, `backend/app/services/events.py`

`log_event` is called for some actions (file upload) but not for folder creation, rename, move, copy, delete, or login events.

**Fix:** Call `log_event` consistently for every mutation. Ensure the frontend activity feed displays the full history, not just uploads.

---

### 18. No health-check or readiness endpoint

There is no `GET /health` endpoint. Docker Compose has no `healthcheck` directive for the backend container, so orchestration systems cannot detect a stuck/crashed backend.

**Fix:** Add `GET /api/v1/health` returning `{"status": "ok", "version": "..."}` (no auth). Add a `HEALTHCHECK` directive to `backend/Dockerfile`.

---

### 19. Settings are not synced across devices

Settings (theme, keybinds, view mode) are stored in `localStorage` only. Logging in from a second device gives the user a blank settings slate.

**Design decision:** Sync is **always-on** — there is no per-device opt-out. Server preferences are the source of truth; `localStorage` is only a cache.

**Fix:** Add a `user_preferences` JSONB column to the `users` table. Expose `GET /api/v1/me/preferences` and `PATCH /api/v1/me/preferences` (auth required). On login, fetch server preferences and hydrate all relevant stores (`themeStore`, `keybindStore`, `uiStore`). On any preference change in the UI, debounce-PATCH the server within ~500 ms. `localStorage` can remain as a fallback for the initial render before the fetch resolves.

---

### 20. No OpenAPI / Swagger docs for contributors

FastAPI generates OpenAPI docs automatically, but the API is only reachable through the Nginx proxy which blocks `/docs` in production.

**Fix:** Either expose `/docs` behind an optional `ENABLE_API_DOCS=true` env flag, or generate a static `openapi.json` during CI and commit it so contributors can explore the API without running the stack.

---

## 🟢 Low

### 21. Density settings (compact / comfortable / spacious) are not implemented

**Files:** `frontend/src/store/uiStore.ts`

A density toggle would improve usability for both power users (compact) and accessibility needs (spacious).

**Fix:** Add a `density` field to `uiStore` (`compact | comfortable | spacious`). Apply CSS-variable-based spacing multipliers in the file grid, list, and table views.

---

### 22. Folder tree in the sidebar does not lazy-load deep trees

**Files:** `frontend/src/themes/default/components/FolderTree.tsx`

If a user has hundreds of nested folders, the entire tree is fetched on mount.

**Fix:** Load children only when a folder node is expanded (lazy load on `chevron` click).

---

### 23. No keyboard navigation in the file grid

Users cannot navigate the file grid with arrow keys or open items with Enter, limiting accessibility and power-user workflows.

**Fix:** Add roving `tabindex` to file/folder cards. Arrow keys move focus, Enter opens/navigates, Space toggles selection.

---

### 24. Missing CONTRIBUTING.md

There is no guide for contributors explaining how to set up a local dev environment, run the backend outside Docker, or run linters/formatters.

**Fix:** Add `CONTRIBUTING.md` covering:
- Local dev setup (Python venv, `uvicorn --reload`, Vite dev server)
- Environment variable bootstrap
- How to run the Alembic migrations locally
- Lint / format commands (`ruff`, `eslint`, `prettier`)

---

### 25. Docker image has no non-root user

**Files:** `backend/Dockerfile`, `frontend/Dockerfile`

Both Dockerfiles run as root, which is a container security best practice violation.

**Fix:** Add `RUN addgroup --system tv && adduser --system --ingroup tv tv` and `USER tv` before the `CMD`/`ENTRYPOINT` in each Dockerfile.

---

### 26. No CI pipeline for automated tests and linting

There is a `.github/workflows/docker-publish.yml` for image publishing, but no workflow runs tests or linters on pull requests.

**Fix:** Add `.github/workflows/ci.yml` with:
- Backend: `ruff check`, `ruff format --check`, `pytest`
- Frontend: `eslint`, `tsc --noEmit`, `vite build`

---

### 27. `vite.svg` placeholder asset is still in the repository

**Files:** `frontend/src/assets/vite.svg`

This is a Vite scaffolding artifact that has no purpose in the final app.

**Fix:** Delete it.

