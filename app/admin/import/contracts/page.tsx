export const dynamic = "force-dynamic"

import { ImportPage } from "@/components/import/import-page"
import { ImportContractsClient } from "./import-client"

export default function ImportContractsPage() {
  return (
    <ImportPage
      title="Импорт договоров"
      subtitle="Реестр договоров из Excel или CSV. Арендатор находится по БИН/ИИН или названию."
      warning="Сначала загрузите арендаторов, потом договоры — иначе договор не к кому привязать."
      columns={
        <>
          <p><b>Номер договора</b> (обязательно) — «Номер», «№» или «Договор».</p>
          <p><b>Арендатор</b> — БИН/ИИН (точнее) либо название. Должен уже быть в системе.</p>
          <p><b>Даты</b> — «Дата начала» и «Дата окончания» в ДД.ММ.ГГГГ или ГГГГ-ММ-ДД.</p>
          <p><b>Статус</b> — подписан, черновик, истёк или расторгнут. По умолчанию «Подписан».</p>
          <p>Повтор того же номера у того же арендатора пропускается.</p>
        </>
      }
    >
      <ImportContractsClient />
    </ImportPage>
  )
}
