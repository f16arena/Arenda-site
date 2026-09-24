import { describe, expect, it } from "vitest"
import { autoMapColumns, normalizeLegalType } from "@/lib/excel-import"

/**
 * Сопоставление колонок Excel — не интерфейс, а распознавание того, что принёс
 * пользователь. Файлы приходят и на русском (часто из 1С), и на казахском,
 * поэтому списки алиасов двуязычные, а не переведённые.
 *
 * Тест закрывает три вещи, каждая из которых уже ломалась:
 *  - казахская шапка вообще не находилась, импорт молча давал ноль колонок;
 *  - короткий алиас забирал чужую колонку («м²» после чистки — это «м», и оно
 *    есть внутри «Помещение» и «Компания атауы»);
 *  - буква ң выпадала при нормализации, и «Заңды мекенжайы» превращалось в
 *    «задымекенжайы».
 */

// Тот же набор, что в app/actions/import-tenants.ts — русские варианты.
const RU_SYNONYMS: Record<string, string[]> = {
  contactName: ["ФИО", "Контактное лицо", "Контакт", "Имя"],
  phone: ["Телефон", "Тел", "Моб"],
  email: ["Email", "Эл почта", "Электронная почта"],
  companyName: ["Название", "Компания", "Контрагент", "Организация", "Наименование"],
  legalType: ["Тип", "Форма", "Орг форма"],
  bin: ["БИН", "ИИН", "БИН/ИИН"],
  spaceNumber: ["Помещение", "Кабинет", "Каб", "Офис"],
  area: ["Площадь", "м2", "м²", "Кв м"],
  rate: ["Ставка", "Цена за м2", "Тариф"],
  contractStart: ["Дата начала", "Начало", "С"],
  contractEnd: ["Дата окончания", "Окончание", "По"],
  legalAddress: ["Юр адрес", "Юридический адрес"],
  directorName: ["Директор", "Руководитель"],
}

describe("autoMapColumns", () => {
  it("находит колонки в казахской шапке", () => {
    const headers = [
      "Компания атауы",
      "БСН/ЖСН",
      "Аты-жөні",
      "Ұялы телефон",
      "Электрондық пошта",
      "Заңды мекенжайы",
      "Бас директор",
    ]
    const map = autoMapColumns(headers, RU_SYNONYMS)
    expect(map.companyName).toBe(0)
    expect(map.bin).toBe(1)
    expect(map.contactName).toBe(2)
    expect(map.phone).toBe(3)
    expect(map.email).toBe(4)
    expect(map.legalAddress).toBe(5)
    expect(map.directorName).toBe(6)
  })

  it("по-прежнему находит колонки в русской шапке", () => {
    const headers = ["Наименование", "БИН/ИИН", "ФИО", "Телефон", "Площадь", "Ставка"]
    const map = autoMapColumns(headers, RU_SYNONYMS)
    expect(map.companyName).toBe(0)
    expect(map.bin).toBe(1)
    expect(map.contactName).toBe(2)
    expect(map.phone).toBe(3)
    expect(map.area).toBe(4)
    expect(map.rate).toBe(5)
  })

  it("короткий алиас «м²» не забирает колонку «Помещение»", () => {
    const headers = ["Компания", "Помещение", "Площадь"]
    const map = autoMapColumns(headers, RU_SYNONYMS)
    expect(map.spaceNumber).toBe(1)
    expect(map.area).toBe(2)
  })

  it("короткий алиас «м²» не забирает казахское «Компания атауы»", () => {
    const headers = ["Компания атауы", "Ауданы"]
    const map = autoMapColumns(headers, RU_SYNONYMS)
    expect(map.companyName).toBe(0)
    expect(map.area).toBe(1)
  })

  it("однобуквенные «С» и «По» работают точным совпадением", () => {
    const headers = ["Наименование", "С", "По"]
    const map = autoMapColumns(headers, RU_SYNONYMS)
    expect(map.contractStart).toBe(1)
    expect(map.contractEnd).toBe(2)
  })

  it("ё и е в шапке считаются одной буквой", () => {
    const withYo = autoMapColumns(["Наименование", "Учёт"], RU_SYNONYMS)
    const withE = autoMapColumns(["Наименование", "Учет"], RU_SYNONYMS)
    expect(withYo.companyName).toBe(withE.companyName)
  })

  it("не выдумывает колонки, которых в файле нет", () => {
    const map = autoMapColumns(["Компания"], RU_SYNONYMS)
    expect(map.companyName).toBe(0)
    expect(map.phone).toBeUndefined()
    expect(map.legalAddress).toBeUndefined()
  })
})

describe("normalizeLegalType", () => {
  it("понимает казахские правовые формы", () => {
    expect(normalizeLegalType("ЖШС")).toBe("TOO")
    expect(normalizeLegalType("ЖК")).toBe("IP")
    expect(normalizeLegalType("АҚ")).toBe("AO")
  })

  it("понимает русские правовые формы", () => {
    expect(normalizeLegalType("ТОО")).toBe("TOO")
    expect(normalizeLegalType("ИП")).toBe("IP")
    expect(normalizeLegalType("АО")).toBe("AO")
  })
})
