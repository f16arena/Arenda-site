-- Импортированная 3D-модель (GLB/GLTF из SketchUp/Blender и т.п.):
-- kind="custom", model_url ссылается на сохранённый файл (/api/storage/<id>).
ALTER TABLE "building_decor"
  ADD COLUMN IF NOT EXISTS "model_url" TEXT;
