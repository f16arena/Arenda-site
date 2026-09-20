export const dynamic = "force-dynamic"

import { ImportPage } from "@/components/import/import-page"
import { ImportTenantsClient } from "./import-client"

export default function ImportTenantsPage() {
  return (
    <ImportPage
      title="Импорт арендаторов"
      subtitle="Список арендаторов из Excel или CSV — например, выгрузка «Контрагенты» из 1С."
      templateHref="/api/import/tenants/template"
      templateFileName="commrent-tenants-template.xlsx"
      columns={
        <>
          <p><b>Название</b> — подойдёт и «Контрагент», «Компания», «Организация».</p>
          <p><b>Тип</b> — ИП, ТОО, АО, ЧСИ или физлицо. Если не указан — ТОО.</p>
          <p><b>БИН/ИИН</b> — берутся 12 цифр в любом виде: с пробелами, дефисами.</p>
          <p><b>Телефон</b> — приводится к виду +7XXXXXXXXXX.</p>
          <p><b>Дата</b> — ДД.ММ.ГГГГ, ГГГГ-ММ-ДД, ДД/ММ/ГГГГ или число Excel.</p>
          <p><b>№ помещения</b> — если такое есть в здании, арендатор привяжется сам.</p>
        </>
      }
    >
      <ImportTenantsClient />
    </ImportPage>
  )
}
