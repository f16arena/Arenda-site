import { FIELD_CLS } from "@/lib/ui-fields"
import { FileSignature } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { CollapsibleCard } from "@/components/settings/collapsible-card"
import { Button } from "@/components/ui/button"
import { saveOrgEsfConfig } from "@/app/actions/esf-config"
import { getT } from "@/lib/i18n/server"

export type EsfSectionConfig = {
  enabled: boolean
  wsUsername: string | null
  signerIin: string | null
  certPath: string | null
  hasPassword: boolean
  hasPin: boolean
  certFileName: string | null
  gsvsCode: string | null
}

const inputCls = FIELD_CLS

export async function EsfSection({ config }: { config: EsfSectionConfig | null }) {
  const { t } = await getT()
  const c = config
  return (
    <div id="esf-settings">
      <CollapsibleCard title={t("common.settings.esf.title")} icon={<FileSignature className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}>
      <ServerForm action={saveOrgEsfConfig} successMessage={t("common.settings.esf.saved")} encType="multipart/form-data" className="p-5 grid grid-cols-2 gap-4">
        <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {t("common.settings.esf.hint")}
        </p>

        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" name="enabled" defaultChecked={c?.enabled ?? false} className="rounded" />
          {t("common.settings.esf.enable")}
        </label>

        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("common.settings.esf.login")}</label>
          <input name="wsUsername" defaultValue={c?.wsUsername ?? ""} autoComplete="off" placeholder={t("common.settings.esf.loginPlaceholder")} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            {t("common.settings.esf.password")} {c?.hasPassword && <span className="text-emerald-600 dark:text-emerald-400">{t("common.settings.esf.isSet")}</span>}
          </label>
          <input name="wsPassword" type="password" autoComplete="new-password" placeholder={c?.hasPassword ? t("common.settings.esf.keepValue") : t("common.settings.esf.passwordPlaceholder")} className={inputCls} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("common.settings.esf.signerIin")}</label>
          <input name="signerIin" defaultValue={c?.signerIin ?? ""} inputMode="numeric" maxLength={12} placeholder={t("common.settings.esf.signerIinPlaceholder")} className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("common.settings.esf.gsvs")}</label>
          <input name="gsvsCode" defaultValue={c?.gsvsCode ?? ""} autoComplete="off" placeholder={t("common.settings.esf.gsvsPlaceholder")} className={inputCls} />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            {t("common.settings.esf.gsvsHint")}
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            {t("common.settings.esf.pin")} {c?.hasPin && <span className="text-emerald-600 dark:text-emerald-400">{t("common.settings.esf.isSet")}</span>}
          </label>
          <input name="certPin" type="password" autoComplete="new-password" placeholder={c?.hasPin ? t("common.settings.esf.keepValue") : t("common.settings.esf.pinPlaceholder")} className={inputCls} />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            {t("common.settings.esf.cert")} {c?.certFileName && <span className="text-emerald-600 dark:text-emerald-400">{t("common.settings.esf.certLoaded", { name: c.certFileName })}</span>}
          </label>
          <input name="certFile" type="file" accept=".p12,.pfx" className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs dark:file:bg-slate-800`} />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            {t("common.settings.esf.certHint")}
          </p>
        </div>

        <details className="col-span-2 text-xs text-slate-400 dark:text-slate-500">
          <summary className="cursor-pointer">{t("common.settings.esf.altSummary")}</summary>
          <div className="mt-2">
            <input name="certPath" defaultValue={c?.certPath ?? ""} autoComplete="off" placeholder="/opt/esf-sign/keys/org.p12" className={inputCls} />
            <p className="mt-1">{t("common.settings.esf.altHint")}</p>
          </div>
        </details>

        <div className="col-span-2 flex justify-end">
          <Button type="submit" size="lg" className="font-medium">{t("common.actions.save")}</Button>
        </div>
      </ServerForm>
      </CollapsibleCard>
    </div>
  )
}
