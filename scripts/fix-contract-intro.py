"""
Заменяет в шаблоне договора длинный «ручной» параграф шапки с
{landlord_name}, в лице {landlord_short}, действующего на основании
{landlord_basis}, ... {tenant_name}, в лице {tenant_director}, ...

на компактные plug-and-play плейсхолдеры {landlord_intro} + {tenant_intro},
которые сами строят правильную фразу (без «в лице ИП Х» для ИП/ЧСИ,
со склонением фамилии для ТОО/АО, с сокращением до Фамилия И.О.).

Запуск:
    python scripts/fix-contract-intro.py "<path-to-docx>"
"""
import sys
import zipfile
import shutil
import io
import re
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
ET.register_namespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")

# Целевой параграф: содержит «{landlord_name}» и «{tenant_name}» и обороты
# «именуем…» — это шапка договора.
NEW_INTRO_TEXT = (
    "{landlord_intro}, с одной стороны, и {tenant_intro}, с другой стороны, "
    "совместно именуемые «Стороны», заключили настоящий Договор аренды "
    "нежилого помещения (далее — «Договор») о нижеследующем:"
)


def replace_intro(root) -> int:
    """Найти и заменить параграф-шапку. Возвращает кол-во замен."""
    changes = 0
    for p in root.iter(NS + "p"):
        text_nodes = list(p.iter(NS + "t"))
        if not text_nodes:
            continue
        full = "".join((t.text or "") for t in text_nodes)
        # Эвристика — должны быть оба ключевых placeholder'а в одной строке.
        if "{landlord_name}" in full and "{tenant_name}" in full and "именуем" in full:
            text_nodes[0].text = NEW_INTRO_TEXT
            for t in text_nodes[1:]:
                t.text = ""
            changes += 1
    return changes


def convert(src: Path, dst: Path):
    files_to_rewrite = {}
    total_changes = 0

    with zipfile.ZipFile(src) as zin:
        for name in zin.namelist():
            if not name.endswith("document.xml"):
                continue
            try:
                tree = ET.parse(io.BytesIO(zin.read(name)))
                n = replace_intro(tree.getroot())
                if n > 0:
                    buf = io.BytesIO()
                    tree.write(buf, xml_declaration=True, encoding="UTF-8", default_namespace=None)
                    files_to_rewrite[name] = buf.getvalue()
                    total_changes += n
            except ET.ParseError as e:
                print(f"  Skipping {name}: {e}")

    tmp = dst.with_suffix(".tmp.docx")
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.namelist():
            data = files_to_rewrite.get(item)
            if data is None:
                data = zin.read(item)
            zout.writestr(item, data)
    shutil.move(tmp, dst)
    print(f"OK: {total_changes} параграф(а) шапки заменён(ы) на {{landlord_intro}}+{{tenant_intro}}")
    print(f"Output: {dst}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fix-contract-intro.py <path-to-docx>")
        sys.exit(1)
    src = Path(sys.argv[1])
    if not src.exists():
        print(f"FAIL: file not found: {src}")
        sys.exit(1)
    dst = src.with_name(src.stem + "_intro_fixed" + src.suffix)
    convert(src, dst)
