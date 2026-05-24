import zipfile, io, xml.etree.ElementTree as ET, sys
sys.stdout.reconfigure(encoding="utf-8")
ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
src = sys.argv[1] if len(sys.argv) > 1 else "C:/Users/Арыстан/Downloads/Договор_аренды_нежилого_помещения_шаблон.docx"
with zipfile.ZipFile(src) as z:
    tree = ET.parse(io.BytesIO(z.read("word/document.xml")))
    keywords = ["именуем", "тариф", "сумма цифрами", "компании", "судебный исполнитель"]
    for p in tree.iter(ns + "p"):
        line = "".join((t.text or "") for t in p.iter(ns + "t"))
        for kw in keywords:
            if kw in line.lower():
                print(f"=== keyword: {kw} ===")
                print(repr(line[:600]))
                print()
                break
