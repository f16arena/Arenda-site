export const dynamic = "force-dynamic"

import { ImportPage } from "@/components/import/import-page"
import { getT } from "@/lib/i18n/server"
import { ImportContractsClient } from "./import-client"

export default async function ImportContractsPage() {
  const { t } = await getT()
  return (
    <ImportPage
      title={t("adminSettings.import.contracts.title")}
      subtitle={t("adminSettings.import.contracts.subtitle")}
      warning={t("adminSettings.import.contracts.warning")}
      columns={
        <>
          <p><b>{t("adminSettings.import.contracts.col1Label")}</b> {t("adminSettings.import.contracts.col1Text")}</p>
          <p><b>{t("adminSettings.import.contracts.col2Label")}</b> {t("adminSettings.import.contracts.col2Text")}</p>
          <p><b>{t("adminSettings.import.contracts.col3Label")}</b> {t("adminSettings.import.contracts.col3Text")}</p>
          <p><b>{t("adminSettings.import.contracts.col4Label")}</b> {t("adminSettings.import.contracts.col4Text")}</p>
          <p>{t("adminSettings.import.contracts.col5")}</p>
        </>
      }
    >
      <ImportContractsClient />
    </ImportPage>
  )
}
