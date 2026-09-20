export const dynamic = "force-dynamic"

import { ImportPage } from "@/components/import/import-page"
import { ImportChargesClient } from "./import-client"

export default function ImportChargesPage() {
  return (
    <ImportPage
      title="Импорт начислений за прошлые месяцы"
      subtitle="Перенос истории из 1С или Excel, чтобы долг считался с самого начала."
      warning="Неоплаченные начисления сразу увеличат долг арендатора — проверьте список перед загрузкой."
      columns={
        <>
          <p><b>Арендатор</b> — БИН/ИИН (точнее) либо название. Должен уже быть в системе.</p>
          <p><b>Период</b> (обязательно) — ГГГГ-ММ, ММ.ГГГГ или любая дата месяца.</p>
          <p><b>Сумма</b> (обязательно) — положительное число.</p>
          <p><b>Тип</b> — аренда, электричество, вода, отопление, уборка. По умолчанию «Аренда».</p>
          <p><b>Оплачено</b> — «да» или «оплачено»: такое начисление в долг не попадёт.</p>
          <p>Повтор «арендатор + период + тип» пропускается.</p>
        </>
      }
    >
      <ImportChargesClient />
    </ImportPage>
  )
}
