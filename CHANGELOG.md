# Changelog

All notable changes to TeleVault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-03-22

### Added

- WASM SHA-256 hashing worker: Rust `sha2` crate compiled to WebAssembly via wasm-pack, replacing the pure-JS fallback for large-file uploads
- Three-strategy hash pipeline: (1) native streaming `crypto.subtle.digest` for Chrome 130+ (near-hardware speed), (2) WASM SHA-256 (~320 MB/s) for all modern browsers, (3) pure-JS fallback for legacy environments
- Prefetch optimisation: chunk N+1 is read from disk concurrently while WASM hashes chunk N, overlapping I/O with computation and reducing 14 GB hash time from ~6 minutes to under 2 minutes
- `wasm-pack` multi-stage Docker build: dedicated `wasm-builder` stage (`rust:1-slim`) injects compiled WASM artifacts into the Node build stage, keeping the image lean
- Cross-platform `build:wasm` npm script (`frontend/scripts/build-wasm.mjs`) for local development outside Docker

---

## [1.1.1] - 2026-03-21

### Added

- New "Queued" status for uploads waiting in the transfer manager to improve clarity during high-concurrency operations

### Fixed

- SSE connection deadlock: consolidated multiple independent progress streams into a single global event source (`useGlobalProgress` hook), preventing browsers from hitting the per-domain connection limit
- Improved SSE heartbeat reliability: standardized ping events to prevent QUIC/TCP idle-timeout disconnects during long-running transfers
- Backend process/status stream merger: unified the event fan-out logic to reduce server load and simplify client-side event handling

### Changed

- Refactored `FileExplorer` to use the global progress hook, removing redundant connection logic and making completion detection more robust
- UI polishing in the transfer manager: improved layout and state transitions for background hashing/uploading tasks

### Removed

- Stale utility scripts (`reset-docker.ps1`, `reset-docker.sh`) and temporary screenshots

---

## [1.1.0] - 2026-03-21

### Added

- Multi-account parallel uploads: connect additional Telegram accounts (alt accounts) to distribute file splits across accounts using round-robin assignment and upload them concurrently via `asyncio.gather()`
- Alt accounts are automatically enrolled as channel co-admins (with explicit `post_messages`, `edit_messages`, `delete_messages`, `invite_users` rights) in all TeleVault-registered channels on add, and unenrolled on remove
- New Accounts panel in Settings: add alt accounts via phone/OTP or QR login flow, view connection status with health indicator dots (green/yellow/red), and remove accounts with confirmation
- 30-minute background health checks detect revoked or disconnected Telegram sessions and surface errors in the UI
- New `/api/v1/accounts/` endpoints for full alt-account CRUD management
- Transfers UI improvements: remaining count display, custom sorting, and duplicate transfer highlighting

### Changed

- `store_telegram_account` now accepts `is_primary` and `add_to_pool` parameters; primary auth path unchanged
- Auth login flow refactored into shared `services/telegram_login.py` helpers with namespace-isolated pending state
- `GET /api/v1/auth/accounts` removed; replaced by `GET /api/v1/accounts/`
- `Split.telegram_account_id` now records the uploading account per split (not the channel owner)

---

## [1.0.11] - 2026-03-21

### Fixed

- Transfer list jumping: preserved item order in the upload store when transitioning from manual upload to Telegram processing.

---

## [1.0.10] - 2026-03-21

### Added

- Configurable `UPLOAD_MAX_PARALLEL_CHUNKS` environment variable (default: `4`): controls how many 5 MB chunks the browser uploads simultaneously, allowing throughput to be tuned without changing the per-request size
- Backend now returns `max_parallel_chunks` in the `/upload/initialize` response so the frontend automatically respects the server-configured value

### Fixed

- Chunked upload 524 timeout: reduced default `UPLOAD_CHUNK_SIZE` from 90 MB to 5 MB so every single chunk request completes well within Cloudflare's 100-second connection timeout even on slow links
- Blocking event-loop I/O in chunk handler: the `upload_chunk` endpoint previously called `f.write()` synchronously inside an `async` function, stalling the event loop during disk writes; writes are now dispatched to a thread via `asyncio.to_thread`
- Parallel chunk writes landing at wrong offsets: the temporary file is now pre-allocated to its full size at `initialize` time, and each chunk is written at `chunk_index × chunk_size` using `f.seek()` instead of appending, ensuring correctness when multiple chunks arrive out of order

---

## [1.0.9] - 2026-03-21

### Fixed

- Backend 524 Timeout (Database connection exhaustion): refactored the `/upload` endpoint to authenticate and process the request stream *without* holding an active database session. Database connections are now acquired only after the upload has landed in temporary storage, preventing pool exhaustion during concurrent or slow transfers.

---

## [1.0.8] - 2026-03-21
- Frontend 401 Duplicate Check: refactored the `check-hash` duplicate check to use the standard `apiClient`, inheriting automatic token refresh logic if the session expires during a long upload queue.

---

## [1.0.7] - 2026-03-21

### Added

- Chunked file upload support for large files (> 50MB): default 90MB chunks to bypass Cloudflare and Nginx payload limits (fixes 413 Payload Too Large)
- Configurable chunk size: added `UPLOAD_CHUNK_SIZE` environment variable to the backend, allowing users to tune upload performance and granularity
- Smooth, real-time progress reporting: implemented `XMLHttpRequest` for individual chunks, providing intra-chunk progress updates instead of jumping after each block
- Backend endpoints for initializing, uploading chunks, and finalizing uploads to support the new chunking mechanism

### Fixed

- Duplicate file uploads: if a file with the same hash already exists, the frontend now identifies it pre-upload and marks it as "Already uploaded" instead of failing with a 409 Conflict error
- Hardened authentication refresh during uploads: ensures the token is refreshed and the request retried for every chunk if needed, preventing session timeouts on very long multi-GB uploads

---

## [1.0.6] - 2026-03-21

### Fixed

- Large file uploads stalling at "Uploading (TeleVault)... 0%": the XHR upload to the server now refreshes the access token and retries automatically if the token expires mid-upload (relevant for files that take longer than 30 minutes to transfer)
- SSE progress stream reconnecting with a stale token after transient connection drops: the upload queue and transfer tray now always read the latest token from the auth store on each reconnect attempt rather than reusing the token captured at connection time

---

## [1.0.5] - 2026-03-21

### Fixed

- Large file uploads stalling at the "Uploading to TeleVault" phase due to compounding SSE/QUIC issues:
  - Rewrote `OperationRegistry` with a fan-out broadcast model so multiple SSE consumers (upload queue and transfers tray) each receive every progress event independently
  - Added a 20-second SSE heartbeat (`ping` comment line) to both the progress and global events streams, preventing QUIC idle-timeout disconnects during long uploads
  - Replaced immediate error-on-disconnect behaviour in `useUploadSSE` with exponential backoff (1 s → 16 s) so transient QUIC reconnects no longer mark uploads as failed
  - Added a dedicated SSE connection owned by the upload queue in `FileExplorer`, making completion detection independent of whether the transfers tray UI is mounted
  - Extended Nginx `client_body_timeout` from the default 60 s to 3600 s for the upload endpoint, preventing connection drops mid-stream on slow or large uploads
  - Added `Alt-Svc: none` response headers to the progress SSE and file upload Nginx locations to prevent browsers from attempting HTTP/3 (QUIC) on those endpoints

---

## [1.0.4] - 2026-03-20

### Fixed

- `tokens.css` failing to load in production with MIME type mismatch (`text/html` instead of JavaScript): replaced `/* @vite-ignore */` dynamic import with `import.meta.glob` so Vite bundles all theme token files at build time instead of attempting a runtime path fetch that nginx could not resolve
- SSE event stream (`/api/v1/events/stream`) repeatedly failing with `ERR_QUIC_PROTOCOL_ERROR`: added `Alt-Svc: none` response header to the nginx SSE location blocks to prevent browsers from upgrading the long-lived connection to HTTP/3 (QUIC), which is incompatible with chunked SSE streams

## [1.0.3] - 2026-03-20

### Added

- Sequential file uploading: files are now uploaded one by one to prevent client/server overload and improve reliability
- New "Queued" status for uploads waiting in the transfer manager
- Early access warning modal that appearing on first login to inform about the development status

### Changed

- Restricted backend Docker container access to the internal network; access is now only possible through the frontend proxy
- Updated project documentation with safety warnings and Docker update instructions
- Aligned version numbers across frontend and backend

## [1.0.2] - 2026-03-20

### Fixed

- `CORS_ORIGINS` env var now accepts plain strings and comma-separated values in addition to JSON arrays, preventing a pydantic-settings parse error on startup
- Added `crypto.randomUUID` polyfill for non-secure HTTP contexts (e.g. local network without TLS), resolving a `TypeError` on upload

## [1.0.1] - 2026-03-20

### Added

- All-in-one Docker image bundling PostgreSQL 16, backend, and Nginx — no external database container required
- `docker/entrypoint.sh` initialises and migrates PostgreSQL on first run, then hands off to supervisord
- `docker/supervisord.conf` manages all three services (PostgreSQL, backend, Nginx) under a single process

### Fixed

- PostgreSQL startup failure caused by apt pre-initialising the data directory before `initdb` could run
- supervisord PostgreSQL program no longer references the Debian system `postgresql.conf`, avoiding `pg_hba.conf` conflicts that caused password authentication failures

## [1.0.0] - 2026-03-20

### Added

- Drag-and-drop support for moving files and folders in the explorer
- Multi-select with lasso selection and bulk operations (move, copy, delete)
- Hierarchical folder organization with custom icons and accent colors (up to 10 levels deep)
- File upload and download with real-time progress tracking via Server-Sent Events
- Grid, list, and table view modes in the file explorer
- Full-text file search by name and metadata
- Telegram OTP and QR-code authentication with JWT + refresh token sessions
- Fernet-encrypted Telegram session storage
- Content-hash based file deduplication
- Docker Compose stack with Nginx reverse proxy
- Frontend served via Nginx; backend API only reachable through proxy
- `VITE_THEME` build argument for UI theme selection
- `ADMIN_TELEGRAM_ID` environment variable for automatic admin promotion on first login

[1.1.1]: https://github.com/elpideus/TeleVault/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/elpideus/TeleVault/compare/v1.0.11...v1.1.0
[1.0.11]: https://github.com/elpideus/TeleVault/compare/v1.0.10...v1.0.11
[1.0.10]: https://github.com/elpideus/TeleVault/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/elpideus/TeleVault/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/elpideus/TeleVault/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/elpideus/TeleVault/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/elpideus/TeleVault/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/elpideus/TeleVault/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/elpideus/TeleVault/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/elpideus/TeleVault/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/elpideus/TeleVault/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/elpideus/TeleVault/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/elpideus/TeleVault/releases/tag/v1.0.0
