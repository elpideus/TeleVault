# Changelog

All notable changes to TeleVault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[Unreleased]: https://github.com/elpideus/TeleVault/compare/v1.0.4...HEAD
[1.0.4]: https://github.com/elpideus/TeleVault/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/elpideus/TeleVault/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/elpideus/TeleVault/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/elpideus/TeleVault/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/elpideus/TeleVault/releases/tag/v1.0.0
