// Приёмочные тесты ЭЦП-payload и движка АВР. Запуск: npx tsx scripts/test-ecp-avr.ts
// Без сети/БД — только чистая логика (детерминизм подписываемой строки, суммы акта,
// гард-кейсы клиента NCANode).

import { buildContractSigningPayload, contractPayloadBase64 } from "../lib/contract-signing-payload"
import {
  defaultAvrState, itemSum, avrSubtotal, avrVat, avrTotal, periodLabel, periodEndDate,
  type AvrState,
} from "../lib/avr-engine"
import { renderAvrText } from "../lib/avr-engine/render"
import { verifyCmsWithNcanode } from "../lib/ncanode"

let passed = 0
let failed = 0
function check(name: string, cond: boolean) {
  if (cond) { passed++ } else { failed++; console.error("  ✗ FAIL:", name) }
}

// ─── 1. Подписываемая строка договора (детерминизм + привязка) ───
{
  const base = { number: "001", type: "STANDARD", content: "Текст\r\nдоговора", startDate: "2026-01-10", endDate: "2027-01-10", tenantCompany: "ТОО Ромашка" }
  const a = buildContractSigningPayload(base)
  const b = buildContractSigningPayload({ ...base })
  check("payload детерминирован (одинаковый ввод → одинаковый вывод)", a === b)
  check("payload содержит версию ARENDA-CONTRACT-SIGN-V1", a.startsWith("ARENDA-CONTRACT-SIGN-V1"))
  check("payload нормализует CRLF→LF", !a.includes("\r"))
  check("payload содержит номер", a.includes("№ 001"))
  check("payload содержит арендатора", a.includes("ТОО Ромашка"))
  // base64 round-trip
  const b64 = contractPayloadBase64(base)
  const decoded = Buffer.from(b64, "base64").toString("utf-8")
  check("base64(payload) корректно декодируется обратно", decoded === a)
  // изменение контента → другой payload (нельзя «переклеить»)
  const changed = buildContractSigningPayload({ ...base, content: "Другой текст" })
  check("изменение текста меняет payload (привязка работает)", changed !== a)
  // ADDENDUM меняет заголовок
  const ds = buildContractSigningPayload({ ...base, type: "ADDENDUM" })
  check("type=ADDENDUM меняет заголовок", ds.includes("ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ") && !ds.includes("ДОГОВОР АРЕНДЫ"))
}

// ─── 2. Суммы акта (АВР) ───
{
  const s: AvrState = defaultAvrState()
  s.items = [
    { name: "Аренда", date: "", report: "", unit: "мес", qty: 1, price: 500000 },
    { name: "Эксплуатация", date: "", report: "", unit: "усл.", qty: 2, price: 40000 },
  ]
  check("itemSum = qty*price", itemSum(s.items[1]) === 80000)
  check("avrSubtotal суммирует строки", avrSubtotal(s) === 580000)
  s.vat = { enabled: false, rate: 16 }
  check("без НДС: vat=0", avrVat(s) === 0)
  check("без НДС: total=subtotal", avrTotal(s) === 580000)
  s.vat = { enabled: true, rate: 16 }
  check("НДС 16%: vat округляется", avrVat(s) === Math.round(580000 * 16 / 100))
  check("с НДС: total=subtotal+vat", avrTotal(s) === 580000 + avrVat(s))
  check("itemSum округляет дробное", itemSum({ name: "", date: "", report: "", unit: "", qty: 3, price: 33.34 }) === 100)
}

// ─── 3. Период ───
{
  check("periodLabel валидный", periodLabel("2026-05") === "мая 2026 г.")
  check("periodLabel пустой → дефолт", periodLabel("") === "—")
  check("periodLabel мусор → возврат как есть", periodLabel("abc") === "abc")
  check("periodEndDate: май 2026 → 31.05.2026", periodEndDate("2026-05") === "31.05.2026")
  check("periodEndDate: февраль 2024 (високосный) → 29.02.2024", periodEndDate("2024-02") === "29.02.2024")
  check("periodEndDate: февраль 2026 → 28.02.2026", periodEndDate("2026-02") === "28.02.2026")
}

// ─── 4. renderAvrText — содержит ключевые поля ───
{
  const s = defaultAvrState()
  s.meta.number = "007"; s.period = "2026-05"
  s.executor = { type: "ip", name: "ИП Иванов", binIin: "840214300117", address: "Актобе", comm: "", signatory: "Иванов И.", position: "ИП" }
  s.customer = { type: "too", name: "ТОО Клиент", binIin: "620821300736", address: "УКГ", comm: "", signatory: "Петров П.", position: "Директор" }
  s.items = [{ name: "Аренда", date: "31.05.2026", report: "", unit: "мес", qty: 1, price: 300000 }]
  const t = renderAvrText(s)
  check("renderAvrText: заголовок Р-1", t.includes("АКТ ВЫПОЛНЕННЫХ РАБОТ"))
  check("renderAvrText: Исполнитель", t.includes("ИП Иванов"))
  check("renderAvrText: Заказчик", t.includes("ТОО Клиент"))
  check("renderAvrText: позиция", t.includes("Аренда"))
  check("renderAvrText: детерминирован", renderAvrText(s) === t)
}

// ─── 5. NCANode-клиент: гард-кейсы (без сети) ───
async function ncanodeGuards() {
  const empty = await verifyCmsWithNcanode("")
  check("verifyCmsWithNcanode('') → invalid", empty.valid === false)
  // В тест-окружении NCANODE_SECRET не задан → не валиден, без сетевого вызова
  if (!process.env.NCANODE_SECRET) {
    const noSecret = await verifyCmsWithNcanode("dGVzdA==")
    check("verifyCmsWithNcanode без NCANODE_SECRET → invalid (не блокирует dev)", noSecret.valid === false && /SECRET/i.test(noSecret.reason ?? ""))
  }
}

async function main() {
  await ncanodeGuards()
  console.log(`\n[test-ecp-avr] passed=${passed}, failed=${failed}`)
  if (failed > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
