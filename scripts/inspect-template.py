"""Дамп всех параграфов вокруг заданного ключевого слова — для отладки регэкспов."""
import zipfile, io, xml.etree.ElementTree as ET, sys
sys.stdout.reconfigure(encoding="utf-8")
ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

src = sys.argv[1] if len(sys.argv) > 1 else "C:/Users/Арыстан/Downloads/Договор_аренды_нежилого_помещения_шаблон.docx"
keyword = sys.argv[2] if len(sys.argv) > 2 else "эксплуатационн"

with zipfile.ZipFile(src) as z:
    tree = ET.parse(io.BytesIO(z.read("word/document.xml")))
    paragraphs = []
    for p in tree.iter(ns + "p"):
        line = "".join((t.text or "") for t in p.iter(ns + "t"))
        paragraphs.append(line)

# Печатаем все непустые параграфы с контекстом ±2 от того, что содержит keyword.
to_print = set()
for i, line in enumerate(paragraphs):
    if keyword.lower() in line.lower():
        for j in range(max(0, i - 2), min(len(paragraphs), i + 4)):
            to_print.add(j)

for i in sorted(to_print):
    line = paragraphs[i]
    print(f"[{i}] {repr(line[:300])}")
    print()
