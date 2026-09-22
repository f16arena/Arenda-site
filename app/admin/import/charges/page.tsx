export const dynamic = "force-dynamic"

import { ImportPage } from "@/components/import/import-page"
import { getT } from "@/lib/i18n/server"
import { ImportChargesClient } from "./import-client"

export default async function ImportChargesPage() {
  const { t } = await getT()
  return (
    <ImportPage
      title={t("adminSettings.import.charges.title")}
      subtitle={t("adminSettings.import.charges.subtitle")}
      warning={t("adminSettings.import.charges.warning")}
      columns={
        <>
          <p><b>{t("adminSettings.import.charges.col1Label")}</b> {t("adminSettings.import.charges.col1Text")}</p>
          <p><b>{t("adminSettings.import.charges.col2Label")}</b> {t("adminSettings.import.charges.col2Text")}</p>
          <p><b>{t("adminSettings.import.charges.col3Label")}</b> {t("adminSettings.import.charges.col3Text")}</p>
          <p><b>{t("adminSettings.import.charges.col4Label")}</b> {t("adminSettings.import.charges.col4Text")}</p>
          <p><b>{t("adminSettings.import.charges.col5Label")}</b> {t("adminSettings.import.charges.col5Text")}</p>
          <p>{t("adminSettings.import.charges.col6")}</p>
        </>
      }
    >
      <ImportChargesClient />
    </ImportPage>
  )
}
