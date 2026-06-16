import { FileSignature } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { Button } from "@/components/ui/button"
import { saveOrgEsfConfig } from "@/app/actions/esf-config"

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

const inputCls =
  "w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"

export function EsfSection({ config }: { config: EsfSectionConfig | null }) {
  const c = config
  return (
    <div id="esf-settings" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <FileSignature className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Электронные счета-фактуры (ИС ЭСФ)</h2>
      </div>
      <ServerForm action={saveOrgEsfConfig} successMessage="Реквизиты ЭСФ сохранены" encType="multipart/form-data" className="p-5 grid grid-cols-2 gap-4">
        <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Реквизиты для выписки электронных счетов-фактур (ЭСФ) в ИС ЭСФ (КГД) прямо из счёта. Учётка ЭСФ — это
          логин/пароль кабинета ЭСФ (НЕ пароль ЭЦП). Секреты хранятся в зашифрованном виде. Поля пароля/PIN можно
          оставить пустыми — тогда сохранённое значение не изменится.
        </p>

        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" name="enabled" defaultChecked={c?.enabled ?? false} className="rounded" />
          Включить выписку счетов-фактур (ЭСФ) в ИС ЭСФ
        </label>

        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Логин учётки ЭСФ</label>
          <input name="wsUsername" defaultValue={c?.wsUsername ?? ""} autoComplete="off" placeholder="БИН/ИИН или логин кабинета ЭСФ" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Пароль учётки ЭСФ {c?.hasPassword && <span className="text-emerald-600 dark:text-emerald-400">• задан</span>}
          </label>
          <input name="wsPassword" type="password" autoComplete="new-password" placeholder={c?.hasPassword ? "•••••••• (не менять)" : "пароль кабинета ЭСФ"} className={inputCls} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">ИИН подписанта</label>
          <input name="signerIin" defaultValue={c?.signerIin ?? ""} inputMode="numeric" maxLength={12} placeholder="ИИН владельца ЭЦП (для ИП — его ИИН)" className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Код ГСВС услуги (для АВР)</label>
          <input name="gsvsCode" defaultValue={c?.gsvsCode ?? ""} autoComplete="off" placeholder="напр. 68.20.12.00-0000000000" className={inputCls} />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Обязателен для электронного АВР (графа G2.2). Это код вашей услуги (аренда) из Государственного справочника ГСВС — уточните у бухгалтера. Формат: NN.NN.NN.NN-NNNNNNNNNN.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            PIN контейнера ЭЦП {c?.hasPin && <span className="text-emerald-600 dark:text-emerald-400">• задан</span>}
          </label>
          <input name="certPin" type="password" autoComplete="new-password" placeholder={c?.hasPin ? "•••••••• (не менять)" : "пароль .p12"} className={inputCls} />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Ключ ЭЦП организации (.p12 / .pfx) {c?.certFileName && <span className="text-emerald-600 dark:text-emerald-400">• загружен: {c.certFileName}</span>}
          </label>
          <input name="certFile" type="file" accept=".p12,.pfx" className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs dark:file:bg-slate-800`} />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Загрузите контейнер ГОСТ-ключа (GOSTKNCA…p12). Хранится в зашифрованном виде, защищён PIN-ом выше.
            Оставьте пустым, чтобы не менять уже загруженный ключ.
          </p>
        </div>

        <details className="col-span-2 text-xs text-slate-400 dark:text-slate-500">
          <summary className="cursor-pointer">Альтернатива: ключ файлом на сервере подписи (для платформы)</summary>
          <div className="mt-2">
            <input name="certPath" defaultValue={c?.certPath ?? ""} autoComplete="off" placeholder="/opt/esf-sign/keys/<орг>.p12" className={inputCls} />
            <p className="mt-1">Используется, если ключ не загружен выше. Пусто — ключ по умолчанию.</p>
          </div>
        </details>

        <div className="col-span-2 flex justify-end">
          <Button type="submit" size="lg" className="font-medium">Сохранить</Button>
        </div>
      </ServerForm>
    </div>
  )
}
