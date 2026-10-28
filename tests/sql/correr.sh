#!/usr/bin/env bash
# Cria um Postgres descartável, aplica o schema.sql duas vezes (tem de ser idempotente) e corre os testes de RLS.
# Uso: tests/sql/correr.sh   (precisa dos binários do Postgres 15+ no PATH ou em PG_BIN)
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}"
DIR="$(mktemp -d /tmp/pg-teste-XXXXXX)"
PORTA="${PORTA:-54329}"
trap '"$PG_BIN/pg_ctl" -D "$DIR/dados" -m fast stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

"$PG_BIN/initdb" -D "$DIR/dados" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DIR/dados" -o "-p $PORTA -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
PSQL=("$PG_BIN/psql" -h "$DIR" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

export PGOPTIONS="-c client_min_messages=warning"
"${PSQL[@]}" -f "$AQUI/stub_auth.sql"
echo "schema.sql, 1.ª vez"; "${PSQL[@]}" -f "$RAIZ/supabase/schema.sql"
echo "schema.sql, 2.ª vez"; "${PSQL[@]}" -f "$RAIZ/supabase/schema.sql"
PGOPTIONS="" "${PSQL[@]}" -f "$AQUI/testes_rls.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
echo "schema.sql, 3.ª vez, já com dados"; "${PSQL[@]}" -f "$RAIZ/supabase/schema.sql"
"${PSQL[@]}" -tAc "select 'linhas mantidas: ' || (select count(*) from app.negocios) || ' negócio(s), ' || (select count(*) from app.membros) || ' membros'"
