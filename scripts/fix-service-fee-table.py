"""
Точечный фиксер таблицы «Расчёт эксплуатационного сбора» в Приложении №3.

Заменяет:
  - Ячейку тарифа (одна длинная строка) → на две: зима + лето с одинаковой
    структурой.
  - Ячейку «Размер ... в месяц» (только winter_total) → добавляет ещё
    summer_total.

Сохраняет вёрстку: text-runs, форматирование, table-cell structure.

Запуск:
    python scripts/fix-service-fee-table.py "<path-to-docx>"
"""
import sys
import zipfile
import shutil
import io
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
ET.register_namespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")


def get_paragraph_text(p) -> str:
    return "".join((t.text or "") for t in p.iter(NS + "t"))


def set_paragraph_text(p, text: str):
    """Положить всю строку в первый <w:t>, остальные опустошить."""
    text_nodes = list(p.iter(NS + "t"))
    if not text_nodes:
        return
    text_nodes[0].text = text
    for t in text_nodes[1:]:
        t.text = ""


def make_new_paragraph_like(template_p, text: str):
    """Создать копию параграфа с заменённым текстом. Сохраняет стили pPr/rPr."""
    new_p = ET.fromstring(ET.tostring(template_p))
    text_nodes = list(new_p.iter(NS + "t"))
    if text_nodes:
        text_nodes[0].text = text
        for t in text_nodes[1:]:
            t.text = ""
    return new_p


def fix_table_cells(root):
    """Найти таблицу 'Расчёт эксплуатационного сбора' и поправить нужные ячейки."""
    changes = 0
    for tbl in root.iter(NS + "tbl"):
        # Проверка — это нужная таблица?
        tbl_text = "".join((t.text or "") for t in tbl.iter(NS + "t"))
        if "Площадь арендуемого Помещения" not in tbl_text:
            continue
        if "эксплуатационн" not in tbl_text.lower():
            continue

        # Идём по строкам таблицы.
        for tr in tbl.iter(NS + "tr"):
            cells = list(tr.iter(NS + "tc"))
            if len(cells) < 2:
                continue
            label_cell = cells[0]
            value_cell = cells[1]
            label_text = "".join((t.text or "") for t in label_cell.iter(NS + "t")).strip().lower()

            # Ячейка «Тариф эксплуатационного сбора» — переписать на 2 параграфа.
            if "тариф эксплуатационн" in label_text:
                rewrite_cell_with_two_lines(
                    value_cell,
                    line1="С октября по апрель включительно, {service_fee_winter_rate} тенге за 1 кв. м в месяц",
                    line2="С мая по сентябрь включительно, {service_fee_summer_rate} тенге за 1 кв. м в месяц",
                )
                changes += 1

            # Ячейка «Размер эксплуатационного сбора в месяц» — переписать.
            elif "размер эксплуатационн" in label_text:
                rewrite_cell_with_two_lines(
                    value_cell,
                    line1="С октября по апрель включительно, {service_fee_winter_total} тенге",
                    line2="С мая по сентябрь включительно, {service_fee_summer_total} тенге",
                )
                changes += 1
    return changes


def rewrite_cell_with_two_lines(cell, line1: str, line2: str):
    """
    Очищает все параграфы ячейки, оставляет один параграф-шаблон,
    кладёт line1 в него и добавляет копию параграфа с line2.
    """
    paragraphs = list(cell.findall(NS + "p"))
    if not paragraphs:
        return

    # Первый параграф = line1
    template_p = paragraphs[0]
    set_paragraph_text(template_p, line1)

    # Удалить остальные старые параграфы (заголовок таблицы и подобное).
    for p in paragraphs[1:]:
        cell.remove(p)

    # Добавить новый параграф с line2 (стиль = копия первого).
    new_p = make_new_paragraph_like(template_p, line2)
    # Вставка строго после первого параграфа.
    idx = list(cell).index(template_p) + 1
    cell.insert(idx, new_p)


def convert(src: Path, dst: Path):
    files_to_rewrite = {}
    total_changes = 0

    with zipfile.ZipFile(src) as zin:
        for name in zin.namelist():
            if not name.endswith("document.xml"):
                continue
            xml_data = zin.read(name)
            try:
                tree = ET.parse(io.BytesIO(xml_data))
                root = tree.getroot()
                n = fix_table_cells(root)
                if n > 0:
                    buf = io.BytesIO()
                    tree.write(buf, xml_declaration=True, encoding="UTF-8", default_namespace=None)
                    files_to_rewrite[name] = buf.getvalue()
                    total_changes += n
            except ET.ParseError as e:
                print(f"  Skipping {name}: {e}")

    # Перепаковка.
    tmp = dst.with_suffix(".tmp.docx")
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.namelist():
            data = files_to_rewrite.get(item)
            if data is None:
                data = zin.read(item)
            zout.writestr(item, data)
    shutil.move(tmp, dst)
    print(f"OK: {total_changes} ячеек таблицы исправлены")
    print(f"Output: {dst}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fix-service-fee-table.py <path-to-docx>")
        sys.exit(1)
    src = Path(sys.argv[1])
    if not src.exists():
        print(f"FAIL: file not found: {src}")
        sys.exit(1)
    dst = src.with_name(src.stem + "_fixed" + src.suffix)
    convert(src, dst)
