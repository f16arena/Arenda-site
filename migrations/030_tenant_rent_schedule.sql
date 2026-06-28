-- График ступенчатой аренды (JSON-массив): [{ "from": "YYYY-MM", "amount": <тенге/мес> }, ...].
-- Если задан — переопределяет fixedMonthlyRent/custom_rate помесячно (движок берёт сумму
-- ступени, активной на период). Пусто/NULL — обычная единая ставка. Идемпотентно.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rent_schedule text;
