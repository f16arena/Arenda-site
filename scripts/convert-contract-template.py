"""
Конвертирует docx-шаблон договора аренды:
  1. Объединяет разорванные на runs текстовые куски (Word часто бьёт __________ на части).
  2. Заменяет числовые/текстовые подчёркивания на наши {tag} placeholders по контексту.
  3. Удаляет жёсткие префиксы «ИП»/«ТОО»/«ЧСИ» в шапке и реквизитах — теперь это
     приходит из {tenant_full_name} / {landlord_full_name} автоматически из БД.
  4. Сохраняет результат как новый файл рядом с источником.

Запуск:
    python scripts/convert-contract-template.py \
        "C:/Users/.../Downloads/Договор_аренды_нежилого_помещения_шаблон.docx"
"""
import sys
import re
import zipfile
import shutil
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# Контекстные замены: ищем по уникальному началу или окружающему тексту.
# Порядок имеет значение — более длинные шаблоны проверяем раньше.
# Каждый ключ — регулярное выражение по «слитой» строке параграфа, значение — замена.
PARAGRAPH_REPLACEMENTS = [
    # === Шапка договора ===
    (re.compile(r"Договор\s*№\s*_+"), "Договор № {contract_number}"),
    (re.compile(r"г\.\s*_+"),          "г. {contract_city}"),
    (re.compile(r"«\s*_+\s*»\s*_+\s*20\s*_+\s*года"), "«{contract_day}» {contract_month} {contract_year} года"),

    # === Стороны договора ===
    # «ИП ____________________________, именуемое в дальнейшем «Арендодатель»»
    # Убираем «ИП» — теперь это часть {landlord_full_name}.
    (re.compile(r"(?:ИП|ТОО|АО|ЧСИ)\s+_+(\s*,\s*именуемое\s+в\s+дальнейшем\s+«?Арендодатель)"),
     r"{landlord_full_name}\1"),
    (re.compile(r"в\s+лице\s+_+\s*/Ф\.И\.О\./"), "в лице {landlord_director}"),
    (re.compile(r"Уведомления\s+о\s+_+"),         "{landlord_basis}"),
    # Дата основания (в первый раз — арендодатель): «от «___» _________ ____ г.»
    # Эту мы обработаем универсально позже.

    # «В лице директора управляющий ________ компании ________________________________»
    # → «В лице директора {tenant_director} компании {tenant_full_name}»
    (re.compile(r"В\s+лице\s+директора\s+управляющий\s+_+\s+компании\s+_+"),
     "В лице директора {tenant_director} компании {tenant_full_name}"),
    # «именуемое в дальнейшем «Арендатор», в лице ____________»
    (re.compile(r"(в\s+лице\s+)_+(\s*,\s*действующего\s+на\s+основании)"),
     r"\1{tenant_director}\2"),
    (re.compile(r"Государственной\s+перерегистрации\s*№\s*_+"),
     "{tenant_basis} № {tenant_basis_number}"),

    # === Адрес объекта (раздел 1.1) ===
    (re.compile(r"по\s+адресу:\s*г\.\s*_+\s*,\s*ул\.\s*_+\s*,\s*д\.\s*_+\s*,\s*_+\s*этаж"),
     "по адресу: {building_address}"),
    (re.compile(r"общей\s+площадью\s+_+\s*кв\.\s*м"),
     "общей площадью {tenant_area_sqm} кв. м"),

    # === Арендная плата (раздел 3.1) ===
    # Простой случай: «____ (________________) тенге ... в месяц»
    (re.compile(r"_+\s*\(_+\)\s*тенге\s+в\s+месяц"),
     "{monthly_rent_with_words} тенге в месяц"),
    # Если форма дневная — оставим, владелец вручную перекроет на нужное.
    (re.compile(r"_+\s*\(_+\)\s*тенге\s+за\s+один\s+календарный\s+день"),
     "{rate_per_sqm} тенге за один календарный день"),

    # === Эксплуатационный сбор (раздел 3.6.2) ===
    (re.compile(r"тариф(?:у|ом)?\s+_+\s*\(_+\)\s*тенге\s+за\s+1\s*кв\.\s*м"),
     "тарифу {service_fee_winter_rate} тенге за 1 кв. м"),

    # === Залог (раздел 4.1) ===
    (re.compile(r"_+\s*\(_+\)\s*тенге\s*\(сумма\s+цифрами\s+и\s+прописью\)"),
     "{deposit_amount_with_words} тенге"),

    # === Подсудность (раздел 12.2) ===
    (re.compile(r"межрайонного\s+экономического\s+суда\s+_+\s+области"),
     "межрайонного экономического суда {court_region}"),
    (re.compile(r"г\.\s*_+\s*»\s+по\s+подсудности"),
     "г. {court_city}» по подсудности"),

    # === Реквизиты в подвале (раздел 13) ===
    # Эта часть имеет повторяющиеся узнаваемые лейблы — заменяем после.
    (re.compile(r"Адрес:\s*_+"),     "Адрес: {landlord_address}"),
    (re.compile(r"БИН/ИИН:\s*_+"),   "БИН: {landlord_bin}"),
    (re.compile(r"БИН:\s*_+"),       "БИН: {landlord_bin}"),
    (re.compile(r"ИИН:\s*_+"),       "ИИН: {landlord_iin}"),
    (re.compile(r"ИИК:\s*_+"),       "ИИК: {landlord_iik}"),
    (re.compile(r"БИК:\s*_+"),       "БИК: {landlord_bik}"),
    (re.compile(r"Банк:\s*_+"),      "Банк: {landlord_bank}"),
    (re.compile(r"Тел\.?:\s*_+"),    "Тел.: {landlord_phone}"),
    (re.compile(r"E[\-—]?mail:\s*_+"), "E-mail: {landlord_email}"),
    (re.compile(r"/_+\s*/"),         "/ {landlord_signatory} /"),
]


def merge_runs_in_paragraph(p):
    """
    Соединяет текст всех <w:r><w:t> в одном параграфе, заменяет в едином тексте,
    кладёт результат обратно в первый <w:t>, остальные опустошает (но не удаляет
    runs — чтобы не сломать форматирование подписей/полей).
    """
    text_nodes = list(p.iter(NS + "t"))
    if not text_nodes:
        return False
    full = "".join((t.text or "") for t in text_nodes)
    original = full
    for pattern, replacement in PARAGRAPH_REPLACEMENTS:
        full = pattern.sub(replacement, full)
    if full == original:
        return False
    # Записываем результат в первый <w:t>, остальные обнуляем.
    text_nodes[0].text = full
    for t in text_nodes[1:]:
        t.text = ""
    return True


def convert(src_path: Path, dst_path: Path):
    # Распакуем docx (это zip), модифицируем word/document.xml и word/header*.xml,
    # запакуем обратно.
    import io
    import xml.etree.ElementTree as ET
    ET.register_namespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")

    changes = 0
    files_to_rewrite = {}

    with zipfile.ZipFile(src_path) as zin:
        for name in zin.namelist():
            if name.endswith(".xml") and ("document.xml" in name or "header" in name or "footer" in name):
                xml_data = zin.read(name)
                # Пытаемся распарсить, если XML — заменяем; иначе оставляем.
                try:
                    tree = ET.parse(io.BytesIO(xml_data))
                    root = tree.getroot()
                    for p in root.iter(NS + "p"):
                        if merge_runs_in_paragraph(p):
                            changes += 1
                    # Сериализуем обратно.
                    buf = io.BytesIO()
                    tree.write(buf, xml_declaration=True, encoding="UTF-8", default_namespace=None)
                    files_to_rewrite[name] = buf.getvalue()
                except ET.ParseError:
                    # Битый XML — оставляем как есть.
                    pass

    # Копируем оригинал и перезаписываем модифицированные части.
    shutil.copy(src_path, dst_path)
    # python: чтобы заменить файлы внутри zip, проще пересоздать архив.
    tmp = dst_path.with_suffix(".tmp.docx")
    with zipfile.ZipFile(src_path) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.namelist():
            data = files_to_rewrite.get(item)
            if data is None:
                data = zin.read(item)
            zout.writestr(item, data)
    shutil.move(tmp, dst_path)
    print(f"OK: {changes} параграфов изменено")
    print(f"Файл сохранён: {dst_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python convert-contract-template.py <path-to-docx>")
        sys.exit(1)
    src = Path(sys.argv[1])
    if not src.exists():
        print(f"FAIL: файл не найден: {src}")
        sys.exit(1)
    dst = src.with_name(src.stem + "_с_placeholders" + src.suffix)
    convert(src, dst)
