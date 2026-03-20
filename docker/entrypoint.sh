#!/bin/bash
set -e

PGDATA="/var/lib/postgresql/16/main"
PG_USER="${POSTGRES_USER:-postgres}"
PG_PASSWORD="${POSTGRES_PASSWORD:-televault}"
PG_DB="${POSTGRES_DB:-televault}"
PG_CTL="/usr/lib/postgresql/16/bin/pg_ctl"
PSQL="/usr/lib/postgresql/16/bin/psql"

# Build DATABASE_URL pointing to localhost (overrides the docker-compose variant)
export DATABASE_URL="postgresql+asyncpg://${PG_USER}:${PG_PASSWORD}@localhost:5432/${PG_DB}"

# ── PostgreSQL first-run initialisation ──────────────────────────────────────
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[init] Initializing PostgreSQL data directory..."
    mkdir -p "$PGDATA"
    chown -R postgres:postgres "$(dirname "$PGDATA")"
    su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDATA --auth-host=md5 --auth-local=trust"

    # Allow TCP connections from localhost
    echo "host all all 127.0.0.1/32 md5" >> "$PGDATA/pg_hba.conf"
fi

# ── Start PostgreSQL temporarily for migrations ───────────────────────────────
echo "[init] Starting PostgreSQL..."
chown -R postgres:postgres "$PGDATA"
su postgres -c "$PG_CTL start -D $PGDATA -w -l /var/log/postgresql/startup.log"

# ── Create role & database if they don't exist ────────────────────────────────
echo "[init] Ensuring role and database exist..."
su postgres -c "$PSQL -U postgres" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${PG_USER}') THEN
    CREATE ROLE "${PG_USER}" WITH LOGIN PASSWORD '${PG_PASSWORD}';
  END IF;
END
\$\$;
ALTER ROLE "${PG_USER}" WITH PASSWORD '${PG_PASSWORD}';
SELECT 'CREATE DATABASE "${PG_DB}" OWNER "${PG_USER}"'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${PG_DB}')
\gexec
SQL

# ── Run Alembic migrations ────────────────────────────────────────────────────
echo "[init] Running database migrations..."
cd /app/backend
alembic upgrade head

# ── Stop PostgreSQL (supervisord will take over) ──────────────────────────────
echo "[init] Handing PostgreSQL off to supervisord..."
su postgres -c "$PG_CTL stop -D $PGDATA -m fast"

# ── Start all services ────────────────────────────────────────────────────────
echo "[init] Starting services..."
exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
