"use client"

import type { KeyStoragePref } from "@/lib/ncalayer"
import { useT } from "@/lib/i18n/client"

/**
 * Выбор типа хранилища ЭЦП перед подписанием: файл .p12 или аппаратный токен.
 * Нужен, потому что NCALayer подписывает конкретным хранилищем — если воткнут
 * токен, без выбора нельзя подписать файлом (и наоборот).
 */
const OPTIONS = [
  { value: "file", labelKey: "common.sign.keyTypeFile", hintKey: "common.sign.keyTypeFileHint" },
  { value: "token", labelKey: "common.sign.keyTypeToken", hintKey: "common.sign.keyTypeTokenHint" },
] as const satisfies ReadonlyArray<{ value: Exclude<KeyStoragePref, "auto">; labelKey: string; hintKey: string }>

export function NcaKeyTypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: KeyStoragePref
  onChange: (v: KeyStoragePref) => void
  disabled?: boolean
}) {
  const { t } = useT()
  return (
    <div className="print:hidden">
      <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800/60">
        {OPTIONS.map((o) => {
          const active = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.value)}
              title={t(o.hintKey)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                active
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {t(o.labelKey)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
