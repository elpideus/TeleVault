# ─── Stage 0: Build WASM ─────────────────────────────────────────────────────
FROM rust:1-slim AS wasm-builder
RUN cargo install wasm-pack --version 0.13.1 --locked
WORKDIR /build/wasm-sha256
COPY frontend/wasm-sha256/ .
RUN RUSTFLAGS="-C target-feature=+simd128" \
    wasm-pack build --target no-modules --release --out-dir /wasm-out

# ─── Stage 1: Build frontend ─────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build

WORKDIR /app

# Install dependencies
COPY frontend/package*.json ./
RUN npm install

# Copy source; public/wasm/ is gitignored so it arrives empty here.
# The wasm-builder COPY below then fills it with the real artifacts.
COPY frontend/ .
COPY --from=wasm-builder /wasm-out ./public/wasm/

# Pass build arguments (optional, defaults are used if not provided)
ARG VITE_API_BASE_URL
ARG VITE_THEME=default
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_THEME=$VITE_THEME

RUN npm run build:frontend

# ─── Stage 2: Build Python dependencies ──────────────────────────────────────
FROM python:3.13-slim AS backend-build

RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY backend/pyproject.toml .
# Use a virtualenv for cleaner dependency copying
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir .

# ─── Stage 3: Final all-in-one image ─────────────────────────────────────────
FROM python:3.13-slim

# Install nginx, supervisor, PostgreSQL 16, and runtime tools
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gnupg lsb-release \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        nginx \
        supervisor \
        postgresql-16 \
        postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default \
    && rm -rf /var/lib/postgresql/16/main \
    && sed -i 's/worker_processes.*/worker_processes 1;/g' /etc/nginx/nginx.conf

# Copy virtualenv from builder
COPY --from=backend-build /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy backend application
WORKDIR /app/backend
COPY backend/ .

# Copy built frontend
COPY --from=frontend-build /app/dist /usr/share/nginx/html

# Copy configuration files
COPY docker/nginx-aio.conf /etc/nginx/conf.d/default.conf
COPY docker/supervisord.conf /etc/supervisor/supervisord.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Postgres log dir
RUN mkdir -p /var/log/postgresql && chown postgres:postgres /var/log/postgresql

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
