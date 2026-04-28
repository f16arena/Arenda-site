-- ============================================================
-- ArendaPro — Migration 002: Seed Initial Data
-- Начальные данные: здание, этажи, первый администратор
-- ============================================================


-- Здание F16 Arena
INSERT INTO buildings (id, name, address, responsible, phone, email, total_area)
VALUES (
  'building_main',
  'F16 Arena',
  'г. Алматы, ул. …',
  'Арыстан',
  '+7 (700) 000-00-00',
  'admin@f16arena.kz',
  3200
);


-- Этажи
INSERT INTO floors (id, building_id, number, name, rate_per_sqm) VALUES
  ('floor_0', 'building_main', 0, 'Подвал',   1500),
  ('floor_1', 'building_main', 1, '1 этаж',   2500),
  ('floor_2', 'building_main', 2, '2 этаж',   2500),
  ('floor_3', 'building_main', 3, '3 этаж',   2000);


-- Первый администратор (пароль: admin123 — замените после входа!)
-- bcrypt hash строки "admin123" (rounds=10):
INSERT INTO users (id, name, email, password, role)
VALUES (
  'user_admin',
  'Арыстан',
  'f16arena@gmail.com',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',  -- password: "password" — замените!
  'OWNER'
);
