#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Prueba supabase/schema.sql en un Postgres local.
#  Levanta un cluster de juguete, le aplica el shim que imita a Supabase,
#  corre el esquema DOS veces (para verificar que es idempotente) y despues
#  las pruebas de RLS. Al terminar borra todo.
#
#  Uso:  ./supabase/tests/run.sh
#  Necesita postgresql-16 instalado (initdb, pg_ctl, psql).
# ---------------------------------------------------------------------------
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
# El socket de unix no puede pasar los 107 bytes de ruta, asi que el cluster
# efimero va en un directorio corto.
D="${AG_PGDIR:-/tmp/agpg}"
PUERTO="${AG_PGPORT:-5433}"

limpiar() {
  su postgres -c "$PGBIN/pg_ctl -D $D/data stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$D"
}
trap limpiar EXIT

echo "→ Levantando Postgres de prueba en $D"
rm -rf "$D"; mkdir -p "$D/data" "$D/run"
id postgres >/dev/null 2>&1 || useradd -r -s /bin/bash postgres
chown -R postgres "$D"
su postgres -c "$PGBIN/initdb -D $D/data -U postgres --auth=trust" >/dev/null
su postgres -c "$PGBIN/pg_ctl -D $D/data -o '-k $D/run -p $PUERTO -c listen_addresses=' -l $D/pg.log start" >/dev/null
sleep 1

psql() { PGOPTIONS='-c client_min_messages=warning' command psql -h "$D/run" -p "$PUERTO" -U postgres -v ON_ERROR_STOP=1 "$@"; }

echo "→ Shim de Supabase"
psql -q -f "$RAIZ/supabase/tests/shim_supabase.sql" 2>&1 | grep -v 'wal_level\|HINT' || true

echo "→ schema.sql (primera pasada)"
psql -q -f "$RAIZ/supabase/schema.sql" >/dev/null

echo "→ schema.sql (segunda pasada — tiene que ser idempotente)"
psql -q -f "$RAIZ/supabase/schema.sql" >/dev/null

echo "→ Convivencia: se arma una app ajena con datos ANTES de la agenda"
PGOPTIONS="" command psql -h "$D/run" -p "$PUERTO" -U postgres -v ON_ERROR_STOP=1 -q \
  -f "$RAIZ/supabase/tests/test_convivencia.sql"

echo "→ schema.sql encima de la app ajena (dos veces)"
psql -q -f "$RAIZ/supabase/schema.sql" >/dev/null
psql -q -f "$RAIZ/supabase/schema.sql" >/dev/null

echo "→ Convivencia: verificar que no cambió nada de la app ajena"
PGOPTIONS="" command psql -h "$D/run" -p "$PUERTO" -U postgres -v ON_ERROR_STOP=1 -q \
  -f "$RAIZ/supabase/tests/test_convivencia_verificar.sql"

echo "→ Pruebas de RLS"
PGOPTIONS="" command psql -h "$D/run" -p "$PUERTO" -U postgres -v ON_ERROR_STOP=1 -q -f "$RAIZ/supabase/tests/test_rls.sql"
