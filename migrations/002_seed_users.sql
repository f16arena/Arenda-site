-- ============================================================
-- ArendaPro — Migration 002: Seed Users & Building
-- Запустить в Supabase → SQL Editor после 001_create_schema.sql
-- ============================================================

-- ── Здание ────────────────────────────────────────────────────
INSERT INTO buildings (id, name, address, responsible, phone, email, total_area)
VALUES (
  'bld_f16arena',
  'F16 Arena',
  'г. Алматы',
  'Арыстан',
  '+7 (700) 000-00-00',
  'f16arena@gmail.com',
  3200
);

-- ── Этажи ─────────────────────────────────────────────────────
INSERT INTO floors (id, building_id, number, name, rate_per_sqm) VALUES
  ('floor_0', 'bld_f16arena', 0, 'Подвал',  1500),
  ('floor_1', 'bld_f16arena', 1, '1 этаж',  2500),
  ('floor_2', 'bld_f16arena', 2, '2 этаж',  2500),
  ('floor_3', 'bld_f16arena', 3, '3 этаж',  2000);

-- ── Экстренные контакты ───────────────────────────────────────
INSERT INTO emergency_contacts (building_id, name, phone, category) VALUES
  ('bld_f16arena', 'Пожарная служба',      '101',                'FIRE'),
  ('bld_f16arena', 'Полиция',              '102',                'POLICE'),
  ('bld_f16arena', 'Скорая помощь',        '103',                'AMBULANCE'),
  ('bld_f16arena', 'Водоканал аварийная',  '+7 727 273-03-03',   'WATER'),
  ('bld_f16arena', 'Электросети аварийная','+7 727 230-88-33',   'ELECTRICITY'),
  ('bld_f16arena', 'Газовая служба',       '+7 727 239-25-55',   'GAS');

-- ── Пользователи ──────────────────────────────────────────────
-- DEPRECATED: эта миграция оставлена для совместимости со старыми
-- инсталляциями. Новые установки используют /api/setup, который
-- генерирует случайные пароли через crypto.randomBytes.
--
-- Пароли в этой миграции были скомпрометированы (попали в публичный
-- гит) и должны быть СМЕНЕНЫ при первом входе. Хеши оставлены, чтобы
-- старые БД продолжали работать; стандартные пароли из публичного
-- репо более не валидны (изменены администратором БД).

INSERT INTO users (id, name, email, phone, password, role) VALUES
  (
    'usr_owner',
    'Арыстан',
    'f16arena@gmail.com',
    NULL,
    '$2b$10$nMczAbPbBSPe4Uezsrkae.g5QAzzIwV7WHnZ4cnlOFIjP.UkiaoVK',
    'OWNER'
  ),
  (
    'usr_admin',
    'Администратор',
    'admin@f16arena.kz',
    '+77000000002',
    '$2b$10$kktsKmEXGd825U/Dh5KBwOJz.WH8XsIw8Bke2ZmnluXRtxurfuH.u',
    'ADMIN'
  ),
  (
    'usr_accountant',
    'Бухгалтер',
    'buh@f16arena.kz',
    '+77000000003',
    '$2b$10$GrVOFgxRzpPh8Ci.9qv4teVURejBnms1wbXyV5ysl7tgF//QOGQHa',
    'ACCOUNTANT'
  ),
  (
    'usr_manager',
    'Завхоз',
    NULL,
    '+77000000004',
    '$2b$10$CguGnVykWD6b.Smprls8eukc2dsP6WiFDckAAMvB4s1/Sn8Rbb/Bq',
    'FACILITY_MANAGER'
  );

-- ── Профили сотрудников ───────────────────────────────────────
INSERT INTO staff (user_id, position, salary) VALUES
  ('usr_admin',      'Администратор', 250000),
  ('usr_accountant', 'Бухгалтер',     220000),
  ('usr_manager',    'Завхоз',         180000);

-- ============================================================
-- Логины (пароли см. в server-log /api/setup или у администратора):
--
--   Владелец:      f16arena@gmail.com
--   Администратор: admin@f16arena.kz
--   Бухгалтер:     buh@f16arena.kz
--   Завхоз:        +77000000004
-- ============================================================
