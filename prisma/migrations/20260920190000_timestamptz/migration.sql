-- Все отметки времени — с часовым поясом (timestamptz).
-- Раньше колонки были без пояса: сервер работает в UTC, бизнес — по Алматы,
-- и границы «до какого числа» при расчётах на стороне базы смещались.
-- Значения уже хранились в UTC, поэтому конвертация мгновенна и без потерь.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz(3) USING %I AT TIME ZONE ''UTC''',
      r.table_name, r.column_name, r.column_name
    );
  END LOOP;
END $$;
