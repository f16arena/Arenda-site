-- Add the missing Task -> Building relation used by scoped task queries.
-- Existing orphan building_id values are cleared first so the FK can be applied safely.
UPDATE public.tasks AS task
SET building_id = NULL
WHERE task.building_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.buildings AS building
    WHERE building.id = task.building_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_building_id_fkey'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_building_id_fkey
      FOREIGN KEY (building_id)
      REFERENCES public.buildings(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
