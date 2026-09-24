import type { imports as ru } from "../ru/imports"

/** imports: файлдан деректерді жүктеу беттері. Түсініктеме — ru/imports.ts. */
export const imports: typeof ru = {
  page: {
    step1: "Excel немесе CSV файлын таңдаңыз",
    step2: "Жүйе нені танығанын тексеріңіз",
    step3: "Жүктеңіз",
    template: "Бос үлгіні жүктеп алу",
    // Пункты меню 1С не переводим: интерфейс самой программы русский, и
    // казахоязычный бухгалтер ищет в ней именно эти слова.
    from1c: "1С-тен файл: «Контрагенты» → Файл → Сохранить как → Excel (xlsx)",
    whatInFile: "Файлда не болуы керек",
  },
  fields: {
    companyName: "Ұйым атауы",
  },
  tenantNotFoundHint: "Жалға алушы табылмады: {hint}",
}
