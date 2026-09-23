"use client"
import { FIELD_CLS, LABEL_CLS } from "@/lib/ui-fields"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FilePlus2, Upload } from "lucide-react"
import { createExternalContract } from "@/app/actions/external-contract"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/client"

// Внешний договор (PDF контрагента) — для арендаторов, не принимающих нашу
// редакцию (вышки Beeline/Altel, камеры Сергек). Загружаем готовый PDF.
export function ExternalContractButton({ tenantId }: { tenantId: string }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  // Ступени графика аренды (необязательно). Сериализуются в hidden-поле rentSchedule.
  const [steps, setSteps] = useState<{ from: string; amount: string }[]>([])
  const addStep = () => setSteps((s) => [...s, { from: "", amount: "" }])
  const updateStep = (i: number, key: "from" | "amount", v: string) =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, [key]: v } : st)))
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i))
  const rentScheduleJson = JSON.stringify(
    steps
      .filter((s) => /^\d{4}-\d{2}$/.test(s.from) && s.amount !== "" && Number(s.amount) >= 0)
      .map((s) => ({ from: s.from, amount: Number(s.amount) })),
  )

  const inputCls = FIELD_CLS
  const labelCls = LABEL_CLS

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FilePlus2 className="h-3.5 w-3.5" /> {t("adminTenants.external.button")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Пока идёт загрузка — Esc и клик мимо не закрывают окно.
          if (pending) return
          setOpen(next)
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("adminTenants.external.title")}</DialogTitle>
            <DialogDescription className="text-[11.5px]">
              {t("adminTenants.external.description")}
            </DialogDescription>
          </DialogHeader>
          <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    fd.set("tenantId", tenantId)
                    const f = fd.get("file")
                    if (f instanceof File && f.size > 10 * 1024 * 1024) {
                      toast.error(t("adminTenants.external.tooBig"))
                      return
                    }
                    await createExternalContract(fd)
                    toast.success(t("adminTenants.external.added"))
                    setOpen(false)
                    router.refresh()
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : t("adminTenants.external.error"))
                  }
                })
              }
              className="flex min-h-0 flex-1 flex-col gap-4"
            >
              <div className="flex-1 space-y-4 overflow-y-auto">
              <div>
                <label className={labelCls}>{t("adminTenants.external.number")}</label>
                <Input name="number" required placeholder={t("adminTenants.external.numberPlaceholder")} />
              </div>
              <div>
                <label className={labelCls}>{t("adminTenants.external.file")}</label>
                <Input name="file" type="file" accept="application/pdf" required className="file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs dark:file:bg-slate-800 dark:file:text-slate-200" />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t("adminTenants.external.fileHint")}</p>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">{t("adminTenants.external.termsTitle")}</p>
                <p className="-mt-2 mb-3 text-[11px] text-slate-400 dark:text-slate-500">
                  {t("adminTenants.external.termsHint")}
                </p>

                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>{t("adminTenants.external.rent")}</label>
                    <div className="flex gap-2">
                      <select name="rentMode" defaultValue="FIXED" className={`${inputCls} w-40 shrink-0`}>
                        <option value="FIXED">{t("adminTenants.external.modeFixed")}</option>
                        <option value="RATE">{t("adminTenants.external.modeRate")}</option>
                      </select>
                      <Input name="rentAmount" type="number" min="0" step="any" inputMode="decimal" required placeholder={t("adminTenants.external.rentPlaceholder")} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      {t("adminTenants.external.rentHint")}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t("adminTenants.external.start")}</label>
                      <Input name="startDate" type="date" required />
                    </div>
                    <div>
                      <label className={labelCls}>{t("adminTenants.external.end")}</label>
                      <Input name="endDate" type="date" required />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t("adminTenants.external.dueDay")}</label>
                      <Input name="paymentDueDay" type="number" min="1" max="31" placeholder="10" />
                    </div>
                    <div>
                      <label className={labelCls}>{t("adminTenants.external.deposit")}</label>
                      <Input name="depositAmount" type="number" min="0" step="any" inputMode="decimal" placeholder={t("adminTenants.external.depositPlaceholder")} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t("adminTenants.external.indexation")}</label>
                      <Input name="indexationPct" type="number" min="0" step="any" inputMode="decimal" placeholder={t("adminTenants.external.indexationPlaceholder")} />
                    </div>
                    <div>
                      <label className={labelCls}>{t("adminTenants.external.indexationDate")}</label>
                      <Input name="nextIndexationAt" type="date" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t("adminTenants.external.penalty")}</label>
                      <Input name="penaltyPercent" type="number" min="0" max="100" step="any" inputMode="decimal" placeholder={t("adminTenants.external.penaltyPlaceholder")} />
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t("adminTenants.external.penaltyHint")}</p>
                    </div>
                    <div>
                      <label className={labelCls}>{t("adminTenants.external.rentFree")}</label>
                      <Input name="rentFreeMonths" type="number" min="0" max="24" step="1" inputMode="numeric" placeholder={t("adminTenants.external.rentFreePlaceholder")} />
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t("adminTenants.external.rentFreeHint")}</p>
                    </div>
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input name="serviceFeeExempt" type="checkbox" className="mt-0.5" />
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {t("adminTenants.external.serviceFeeExempt")}
                    </span>
                  </label>

                  {/* Ступенчатая аренда: разные суммы по периодам (льготный, рост ставки) */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t("adminTenants.external.scheduleTitle")}</p>
                      <button type="button" onClick={addStep} className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        {t("adminTenants.external.addStep")}
                      </button>
                    </div>
                    <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
                      {t("adminTenants.external.scheduleHint")}
                    </p>
                    {steps.length > 0 && (
                      <div className="space-y-2">
                        {steps.map((st, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              type="month"
                              value={st.from}
                              onChange={(e) => updateStep(i, "from", e.target.value)}
                              className="w-40 shrink-0"
                            />
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              placeholder={t("adminTenants.external.stepAmountPlaceholder")}
                              value={st.amount}
                              onChange={(e) => updateStep(i, "amount", e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => removeStep(i)}
                              className="shrink-0 px-1.5 text-slate-400 hover:text-red-500"
                              title={t("adminTenants.external.removeStep")}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input type="hidden" name="rentSchedule" value={rentScheduleJson} />
                  </div>

                  {/* Входящий долг на момент переноса в систему */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                    <p className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">{t("adminTenants.external.openingDebtTitle")}</p>
                    <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
                      {t("adminTenants.external.openingDebtHint")}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>{t("adminTenants.external.openingDebt")}</label>
                        <Input name="openingDebt" type="number" min="0" step="any" inputMode="decimal" placeholder={t("adminTenants.external.openingDebtPlaceholder")} />
                      </div>
                      <div>
                        <label className={labelCls}>{t("adminTenants.external.openingDebtPeriod")}</label>
                        <Input name="openingDebtPeriod" type="month" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className={labelCls}>{t("adminTenants.external.openingDebtDue")}</label>
                      <Input name="openingDebtDue" type="date" />
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t("adminTenants.external.openingDebtDueHint")}</p>
                    </div>
                  </div>
                </div>
              </div>
              </div>
              <DialogFooter className="shrink-0">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> {pending ? t("adminTenants.external.uploading") : t("adminTenants.external.submit")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
    </>
  )
}
