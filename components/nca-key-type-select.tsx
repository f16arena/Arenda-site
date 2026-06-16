"use client"

import type { KeyStoragePref } from "@/lib/ncalayer"

/**
 * Выбор типа хранилища ЭЦП перед подписанием: файл .p12 или аппаратный токен.
 * Нужен, потому что NCALayer подписывает конкретным хранилищем — если воткнут
 * токен, без выбора нельзя подписать файлом (и наоборот).
 */
const OPTIONS: { value: Exclude<KeyStoragePref, "auto">; label: string; hint: string }[] = [
  { value: "file", label: "Файл (.p12)", hint: "Ключ-файл с egov (GOSTKNCA…/AUTH_RSA…)" },
  { value: "token", label: "Токен", hint: "Kaztoken / eToken / JaCarta в USB" },
]

export function NcaKeyTypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: KeyStoragePref
  onChange: (v: KeyStoragePref) => void
  disabled?: boolean
}) {
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
              title={o.hint}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                active
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
