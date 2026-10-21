#!/bin/bash
# Перенос БД Commrent из Supabase в локальный Postgres (cloud-001).
# Полная замена схемы public в commrent-db-1 + сверка строк и контрольных сумм по каждой таблице.
# Запуск: /opt/commrent/sync-from-supabase.sh   (пробный прогон и финальный при переключении)
set -euo pipefail
cd /opt/commrent
set -a; . ./.env; set +a

PGIMG=postgres:17
TS=$(date -u +%Y%m%d-%H%M%S)
DUMP=backups/supabase-$TS.dump
mkdir -p backups

echo "== 1. Дамп из Supabase"
docker run --rm -e SRC="$SUPABASE_SOURCE_URL" -v "$PWD/backups:/b" $PGIMG \
  pg_dump "$SUPABASE_SOURCE_URL" -Fc -n public --no-owner --no-privileges \
  --no-publications --no-subscriptions -f "/b/$(basename "$DUMP")"
ls -lh "$DUMP"

echo "== 2. Пересоздаю схему public и восстанавливаю"
docker exec -i commrent-db-1 psql -U commrent -d commrent -v ON_ERROR_STOP=1 -q <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
-- CREATE SCHEMA public делает сам дамп (pg_dump -n public).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SQL
docker exec -i commrent-db-1 pg_restore -U commrent -d commrent --no-owner --no-privileges \
  --exit-on-error < "$DUMP"
docker exec commrent-db-1 psql -U commrent -d commrent -q -c "ANALYZE"

echo "== 3. Сверка: строки + md5 содержимого по каждой таблице"
# Для каждой таблицы: count(*) и md5 от отсортированных строк (text-представление).
read -r -d '' Q <<'SQL' || true
SET extra_float_digits = 3;  -- одинаковая (полная) точность float на обеих сторонах
SET default_transaction_read_only = off;  -- на время переключения Supabase в read-only, а сверке нужна временная таблица
DO $$
DECLARE r record; c bigint; h text;
BEGIN
  CREATE TEMP TABLE _v(t text, n bigint, h text);
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename COLLATE "C" LOOP
    EXECUTE format('SELECT count(*), md5(coalesce(string_agg(x::text, %L ORDER BY x::text COLLATE "C"), %L)) FROM public.%I x', E'\n', '', r.tablename) INTO c, h;
    INSERT INTO _v VALUES (r.tablename, c, h);
  END LOOP;
END $$;
SELECT t||'|'||n||'|'||h FROM _v ORDER BY t COLLATE "C";
SQL
docker run --rm -i $PGIMG psql "$SUPABASE_SOURCE_URL" -Atq <<<"$Q" > "backups/verify-src-$TS.txt"
docker exec -i commrent-db-1 psql -U commrent -d commrent -Atq <<<"$Q" > "backups/verify-dst-$TS.txt"

TABLES=$(wc -l < "backups/verify-src-$TS.txt")
ROWS=$(awk -F'|' '{s+=$2} END{print s}' "backups/verify-src-$TS.txt")
if diff -u "backups/verify-src-$TS.txt" "backups/verify-dst-$TS.txt" > "backups/verify-diff-$TS.txt"; then
  echo "OK: $TABLES таблиц, $ROWS строк — количество и содержимое совпадают 1:1"
  rm -f "backups/verify-diff-$TS.txt"
else
  echo "РАСХОЖДЕНИЕ! см. backups/verify-diff-$TS.txt"; cat "backups/verify-diff-$TS.txt"; exit 1
fi

echo "== 4. Структура: источник vs новая БД (должно совпасть)"
S="
select 'rls tables', count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity
union all select 'forced rls', count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relforcerowsecurity
union all select 'policies', count(*) from pg_policies where schemaname='public'
union all select 'indexes', count(*) from pg_indexes where schemaname='public'
union all select 'fkeys', count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and contype='f'
union all select 'prisma migrations', count(*) from public._prisma_migrations
union all select 'large objects', count(*) from pg_largeobject_metadata"
SRC_S=$(docker run --rm $PGIMG psql "$SUPABASE_SOURCE_URL" -At -F' | ' -c "$S")
DST_S=$(docker exec commrent-db-1 psql -U commrent -d commrent -At -F' | ' -c "$S")
paste -d'#' <(echo "$SRC_S") <(echo "$DST_S") | awk -F'#' '{split($1,a," \\| "); split($2,b," \\| "); printf "%-18s src=%-5s dst=%-5s %s\n", a[1], a[2], b[2], (a[2]==b[2]?"ok":"!! РАЗНИЦА")}'
[ "$SRC_S" = "$DST_S" ] || { echo "Структура отличается"; exit 1; }
echo "ГОТОВО: $DUMP"
