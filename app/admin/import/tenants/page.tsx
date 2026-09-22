export const dynamic = "force-dynamic"

import { ImportPage } from "@/components/import/import-page"
import { getT } from "@/lib/i18n/server"
import { ImportTenantsClient } from "./import-client"

export default async function ImportTenantsPage() {
  const { t } = await getT()
  return (
    <ImportPage
      title={t("adminSettings.import.tenants.title")}
      subtitle={t("adminSettings.import.tenants.subtitle")}
      templateHref="/api/import/tenants/template"
      templateFileName="commrent-tenants-template.xlsx"
      columns={
        <>
          <p><b>{t("adminSettings.import.tenants.col1Label")}</b> {t("adminSettings.import.tenants.col1Text")}</p>
          <p><b>{t("adminSettings.import.tenants.col2Label")}</b> {t("adminSettings.import.tenants.col2Text")}</p>
          <p><b>{t("adminSettings.import.tenants.col3Label")}</b> {t("adminSettings.import.tenants.col3Text")}</p>
          <p><b>{t("adminSettings.import.tenants.col4Label")}</b> {t("adminSettings.import.tenants.col4Text")}</p>
          <p><b>{t("adminSettings.import.tenants.col5Label")}</b> {t("adminSettings.import.tenants.col5Text")}</p>
          <p><b>{t("adminSettings.import.tenants.col6Label")}</b> {t("adminSettings.import.tenants.col6Text")}</p>
        </>
      }
    >
      <ImportTenantsClient />
    </ImportPage>
  )
}
