"""
Конвертер docx-шаблона договора аренды → формат {tag} для нашего рендерера.

V2: добавлен порядковый счётчик заходов в одни и те же паттерны:
  - 1-я колонка реквизитов = арендодатель, 2-я колонка = арендатор;
  - 1-я дата в разделе 2.1 = старт договора, 2-я = окончание;
  - 1-е «от «___» г.» (после Уведомления) = landlord_basis_date,
    2-е (после лицензии) = tenant_basis_date.

Запуск:
    python scripts/convert-contract-template.py "<path-to-docx>"
"""
import sys
import re
import zipfile
import shutil
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class ReplacementContext:
    """Состояние счётчиков, чтобы одни и те же паттерны давали разные подстановки."""
    def __init__(self):
        self.counters: dict[str, int] = {}

    def next(self, key: str) -> int:
        n = self.counters.get(key, 0)
        self.counters[key] = n + 1
        return n


# Каждый элемент: (regex, callable(match, context) → str).
# Callable получает match-object и контекст (где можно увеличить счётчик).
def repl_const(text: str):
    """Простая замена на константную строку."""
    return lambda m, ctx: text


def repl_party_requisite(field_landlord: str, field_tenant: str, label: str, key: str):
    """
    Первое вхождение → landlord, второе → tenant. Используется для одинаковых
    меток в реквизитах (БИН/ИИН/ИИК/БИК/Банк/Адрес и т.п.).
    """
    def fn(m, ctx):
        n = ctx.next(key)
        field = field_landlord if n == 0 else field_tenant
        return f"{label}: {{{field}}}"
    return fn


def repl_basis_date(m, ctx):
    """«от «___» _________ ____ г.» — первое landlord, второе tenant."""
    n = ctx.next("basis_date")
    return "от {landlord_basis_date}" if n == 0 else "от {tenant_basis_date}"


def repl_signature_line(m, ctx):
    """«/Ф.И.О./» — первое landlord, второе tenant."""
    n = ctx.next("signature")
    short = "landlord_signatory" if n == 0 else "tenant_director_short"
    return f"/ {{{short}}} /"


# Список (regex, callable). Порядок важен — длинные паттерны раньше коротких.
REPLACEMENTS = [
    # === Шапка договора ===
    (re.compile(r"Договор\s*№\s*_+"), repl_const("Договор № {contract_number}")),

    # Дата заголовка договора («дата подписания»):
    # Если параграф содержит «вступает в силу с ... и ... по ...» — заменим единым блоком.
    (re.compile(
        r"с\s+«\s*_+\s*»\s*_+\s*20\s*_+\s*года\s+и\s+(?:заканчивается|действует)\s+по\s+«\s*_+\s*»\s*_+\s*20\s*_+\s*года"
    ),
     repl_const("с {start_date_long} и действует по {end_date_long}")),
    # Иначе — это шапка договора (его дата подписания).
    (re.compile(r"«\s*_+\s*»\s*_+\s*20\s*_+\s*года"),
     repl_const("«{contract_day}» {contract_month} {contract_year} года")),
    # «от «___» _________ ____ г.» — без 20 (года короче).
    (re.compile(r"от\s+«\s*_+\s*»\s*_+\s*_+\s*г\."), repl_basis_date),
    # Альтернативная форма «от «___» _________ 20___ г.»
    (re.compile(r"от\s+«\s*_+\s*»\s*_+\s*20\s*_+\s*г\."), repl_basis_date),

    # «г. ___________» — город заключения (только в первом вхождении в шапке).
    # Чтобы не зацепить «г. ___» в адресах реквизитов, используем отдельный паттерн ниже.

    # === Стороны договора (шапка) ===
    # «ИП ____________________...,  именуем(ое|ый) в дальнейшем «Арендодатель»»
    (re.compile(r"(?:ИП|ТОО|АО|ЧСИ)\s+_+(\s*,\s*именуем(?:ое|ый)\s+в\s+дальнейшем\s+«?Арендодатель)"),
     lambda m, ctx: "{landlord_full_name}" + m.group(1)),
    # «Частный судебный исполнитель ___ области, именуем... «Арендатор»» или «ИП/ТОО/АО/ЧСИ ___»
    (re.compile(r"(?:Частный\s+судебный\s+исполнитель|ИП|ТОО|АО|ЧСИ)\s+_+\s*(?:области\s*)?(,?\s*именуем(?:ое|ый)\s+в\s+дальнейшем\s+«?Арендатор)"),
     lambda m, ctx: "{tenant_full_name}" + m.group(1)),
    # «В лице директора управляющий ________ компании ________________________________»
    (re.compile(r"В\s+лице\s+директора\s+управляющий\s+_+\s+компании\s+_+"),
     repl_const("В лице директора {tenant_director} компании {tenant_full_name}")),
    # «в лице ____________ /Ф.И.О./» — обычно landlord
    (re.compile(r"в\s+лице\s+_+\s*/Ф\.И\.О\./"), repl_const("в лице {landlord_director}")),
    # «в лице ___, действующего на основании» — обычно tenant (после landlord уже заменён)
    (re.compile(r"в\s+лице\s+_+(\s*,\s*действующего\s+на\s+основании)"),
     lambda m, ctx: "в лице {tenant_director}" + m.group(1)),

    # === Основания сторон ===
    (re.compile(r"Уведомления?\s+о\s+_+"),                  repl_const("Уведомления о {landlord_basis}")),
    (re.compile(r"Уведомлени(?:я|е)\s*№\s*_+"),             repl_const("Уведомления № {landlord_basis_number}")),
    (re.compile(r"государственной\s+лицензии\s*№\s*_+"),    repl_const("государственной лицензии № {tenant_basis_number}")),
    (re.compile(r"Государственной\s+перерегистрации\s*№\s*_+"),
     repl_const("Государственной перерегистрации № {tenant_basis_number}")),

    # === Адрес объекта (раздел 1.1) ===
    # «по адресу: г. {что-то}, ул. ___, д. ___, ___ этаж»  → {building_address}
    (re.compile(r"по\s+адресу:\s*[^,]+,\s*ул\.\s*_+\s*,\s*д\.\s*_+\s*,\s*_+\s*этаж"),
     repl_const("по адресу: {building_address}")),
    (re.compile(r"г\.\s*[\w\{\}]*\s*,\s*ул\.\s*_+\s*,\s*д\.\s*_+\s*,\s*_+\s*этаж"),
     repl_const("{building_address}")),
    # «общей площадью ___ кв. м»
    (re.compile(r"общей\s+площадью\s+_+\s*кв\.\s*м"),
     repl_const("общей площадью {tenant_area_sqm} кв. м")),

    # === Арендная плата (раздел 3.1) ===
    (re.compile(r"_+\s*\(_+\)\s*тенге\s+в\s+месяц"),
     repl_const("{monthly_rent_with_words} тенге в месяц")),
    (re.compile(r"_+\s*\(_+\)\s*тенге\s+за\s+один\s+календарный\s+день"),
     repl_const("{rate_per_sqm} тенге за один календарный день")),

    # === Эксплуатационный сбор (раздел 3.6.2) ===
    (re.compile(r"тариф(?:у|ом)?\s+_+\s*\(_+\)\s*тенге\s+за\s+1\s*кв\.\s*м"),
     repl_const("тарифу {service_fee_winter_rate} тенге за 1 кв. м зимой и {service_fee_summer_rate} тенге за 1 кв. м летом")),

    # === Залог (раздел 4.1) ===
    (re.compile(r"_+\s*\(_+\)\s*тенге\s*\(сумма\s+цифрами\s+и\s+прописью\)"),
     repl_const("{deposit_amount_with_words} тенге")),

    # === Подсудность (раздел 12.2) ===
    (re.compile(r"межрайонного\s+экономического\s+суда\s+_+\s+области"),
     repl_const("межрайонного экономического суда {court_region}")),
    (re.compile(r"г\.\s*_+\s*»\s+по\s+подсудности"),
     repl_const("г. {court_city}» по подсудности")),

    # === Реквизиты (раздел 13) — стохастический счётчик: 1-е landlord, 2-е tenant ===
    (re.compile(r"Адрес:\s*_+"),     repl_party_requisite("landlord_address",   "tenant_address",   "Адрес", "addr")),
    (re.compile(r"БИН/ИИН:\s*_+"),   repl_party_requisite("landlord_bin",       "tenant_bin",       "БИН",   "bin")),
    (re.compile(r"БИН:\s*_+"),       repl_party_requisite("landlord_bin",       "tenant_bin",       "БИН",   "bin")),
    (re.compile(r"ИИН:\s*_+"),       repl_party_requisite("landlord_iin",       "tenant_iin",       "ИИН",   "iin")),
    (re.compile(r"ИИК:\s*_+"),       repl_party_requisite("landlord_iik",       "tenant_iik",       "ИИК",   "iik")),
    (re.compile(r"БИК:\s*_+"),       repl_party_requisite("landlord_bik",       "tenant_bik",       "БИК",   "bik")),
    (re.compile(r"Банк:\s*_+"),      repl_party_requisite("landlord_bank",      "tenant_bank",      "Банк",  "bank")),
    (re.compile(r"Тел\.?:\s*_+"),    repl_party_requisite("landlord_phone",     "tenant_phone",     "Тел.",  "phone")),
    (re.compile(r"E[\-—]?mail:\s*_+"), repl_party_requisite("landlord_email",   "tenant_email",     "E-mail","email")),
    (re.compile(r"/_+\s*/"),         repl_signature_line),

    # «г. ___________» (всё остальное — например в реквизитах). Делаем В САМОМ КОНЦЕ,
    # чтобы не перехватить адрес здания в 1.1, дату суда и т.п.
    (re.compile(r"г\.\s*_+"),        repl_const("г. {contract_city}")),
]


def merge_runs_in_paragraph(p, ctx: ReplacementContext) -> bool:
    """
    Объединяет text-runs параграфа, прогоняет все паттерны с учётом счётчиков,
    кладёт результат в первый <w:t>. Возвращает True если что-то заменилось.
    """
    text_nodes = list(p.iter(NS + "t"))
    if not text_nodes:
        return False
    full = "".join((t.text or "") for t in text_nodes)
    original = full
    for pattern, repl_fn in REPLACEMENTS:
        # Используем функцию-замену с контекстом.
        full = pattern.sub(lambda m: repl_fn(m, ctx), full)
    if full == original:
        return False
    text_nodes[0].text = full
    for t in text_nodes[1:]:
        t.text = ""
    return True


def convert(src_path: Path, dst_path: Path):
    import io
    import xml.etree.ElementTree as ET
    ET.register_namespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")

    changes = 0
    files_to_rewrite = {}
    ctx = ReplacementContext()  # один счётчик на весь документ

    with zipfile.ZipFile(src_path) as zin:
        for name in zin.namelist():
            if name.endswith(".xml") and ("document.xml" in name or "header" in name or "footer" in name):
                xml_data = zin.read(name)
                try:
                    tree = ET.parse(io.BytesIO(xml_data))
                    root = tree.getroot()
                    for p in root.iter(NS + "p"):
                        if merge_runs_in_paragraph(p, ctx):
                            changes += 1
                    buf = io.BytesIO()
                    tree.write(buf, xml_declaration=True, encoding="UTF-8", default_namespace=None)
                    files_to_rewrite[name] = buf.getvalue()
                except ET.ParseError:
                    pass

    tmp = dst_path.with_suffix(".tmp.docx")
    with zipfile.ZipFile(src_path) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.namelist():
            data = files_to_rewrite.get(item)
            if data is None:
                data = zin.read(item)
            zout.writestr(item, data)
    shutil.move(tmp, dst_path)
    print(f"OK: {changes} parahgraphs modified")
    print(f"Counters used: {dict(ctx.counters)}")
    print(f"Output: {dst_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python convert-contract-template.py <path-to-docx>")
        sys.exit(1)
    src = Path(sys.argv[1])
    if not src.exists():
        print(f"FAIL: file not found: {src}")
        sys.exit(1)
    dst = src.with_name(src.stem + "_with_placeholders" + src.suffix)
    convert(src, dst)
