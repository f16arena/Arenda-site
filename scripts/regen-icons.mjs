import sharp from "sharp"

// Перегенерация фавиконок/иконок приложения из чистого знака commrent-mark.png.
// Старые icon.png / apple-icon.png / icon-192 / icon-512 были битые: знак тонул в
// белых полях, а 512 был размытый (апскейл из мелкого). fit:cover = знак на весь
// квадрат, без полей.
const SRC = "public/commrent-mark.png"
const OUT = [
  ["public/icon.png", 64],
  ["public/apple-icon.png", 180],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
]

for (const [file, size] of OUT) {
  const buf = await sharp(SRC)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png({ quality: 95 })
    .toBuffer()
  await sharp(buf).toFile(file)
  console.log(`✓ ${file} (${size}×${size})`)
}
