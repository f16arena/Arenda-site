-- Здание → этажи → помещения → счётчики → показания, расходы и экстренные
-- контакты удаляются вместе со зданием. Раньше цепочка обрывалась на первом
-- же этаже: удалить здание (и тем более организацию) было невозможно.
-- Финансы арендатора (договоры, начисления, оплаты, заявки, документы)
-- по-прежнему запрещают удаление — арендатор удаляется мягко.
ALTER TABLE "floors" DROP CONSTRAINT IF EXISTS "floors_building_id_fkey";
ALTER TABLE "floors" ADD CONSTRAINT "floors_building_id_fkey"
  FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spaces" DROP CONSTRAINT IF EXISTS "spaces_floor_id_fkey";
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_floor_id_fkey"
  FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meters" DROP CONSTRAINT IF EXISTS "meters_space_id_fkey";
ALTER TABLE "meters" ADD CONSTRAINT "meters_space_id_fkey"
  FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meter_readings" DROP CONSTRAINT IF EXISTS "meter_readings_meter_id_fkey";
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_meter_id_fkey"
  FOREIGN KEY ("meter_id") REFERENCES "meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_building_id_fkey";
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_building_id_fkey"
  FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "emergency_contacts" DROP CONSTRAINT IF EXISTS "emergency_contacts_building_id_fkey";
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_building_id_fkey"
  FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
