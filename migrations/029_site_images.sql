-- Изображения публичного сайта (лендинг), редактируемые без передеплоя. Идемпотентно.
CREATE TABLE IF NOT EXISTS site_images (
  slot       text PRIMARY KEY,
  mime       text NOT NULL,
  file_name  text,
  data       bytea NOT NULL,
  updated_at timestamp(3) NOT NULL DEFAULT now()
);
