"use client"

import { useState, useTransition } from "react"
import { Plus, X, Edit2 } from "lucide-react"
import { toast } from "sonner"
import { createSpace, updateSpace, deleteSpace } from "@/app/actions/spaces"
import { DeleteAction } from "@/components/ui/delete-action"

type Floor = {
  id: string
  name: string
  number: number
  totalArea?: number | null  // общая площадь этажа (если задана)
  usedArea?: number          // Σ Space.area на этом этаже (без редактируемого)
}
type Space = { id: string; number: string; area: number; status: string; description: string | null; kind?: string }
type TenantOption = {
  id: string
  companyName: string
  placement: string | null
}
type EditableSpace = Space & {
  tenant?: { id: string; companyName: string } | null
}

const STATUSES = [
  { value: "VACANT", label: "Свободно" },
  { value: "OCCUPIED", label: "Занято" },
  { value: "MAINTENANCE", label: "Обслуживание" },
]

export function AddSpaceDialog({ floors }: { floors: Floor[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [floorId, setFloorId] = useState(floors[0]?.id ?? "")
  const [areaStr, setAreaStr] = useState("")

  const selectedFloor = floors.find((f) => f.id === floorId)
  const total = selectedFloor?.totalArea ?? null
  const used = selectedFloor?.usedArea ?? 0
  const available = total ? Math.max(0, total - used) : null
  const areaNum = parseFloat(areaStr.replace(",", ".")) || 0
  const exceeds = available !== null && areaNum > available + 0.01

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus className="h-4 w-4" />
        Добавить помещение
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Новое помещение</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    await createSpace(fd)
                    toast.success("Помещение создано")
                    setOpen(false)
                    setAreaStr("")
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Не удалось создать")
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Этаж *</label>
                <select
                  name="floorId"
                  required
                  value={floorId}
                  onChange={(e) => setFloorId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                {selectedFloor && total !== null && (
                  <p className={`text-[11px] mt-1 ${exceeds ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                    Этаж: {total} м² · занято {used.toFixed(1)} м² ·{" "}
                    <b className={exceeds ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-400"}>
                      доступно {(available ?? 0).toFixed(1)} м²
                    </b>
                  </p>
                )}
                {selectedFloor && total === null && (
                  <p className="text-[11px] mt-1 text-amber-600 dark:text-amber-400">
                    На этаже не задана общая площадь — лимит не контролируется.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Номер кабинета *</label>
                  <input name="number" required placeholder="101" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Площадь, м² *</label>
                  <input
                    name="area"
                    type="number"
                    step="0.1"
                    required
                    placeholder="30"
                    value={areaStr}
                    onChange={(e) => setAreaStr(e.target.value)}
                    max={available ?? undefined}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                      exceeds
                        ? "border-red-300 dark:border-red-500/40 focus:border-red-500"
                        : "border-slate-200 dark:border-slate-800 focus:border-blue-500"
                    }`}
                  />
                  {exceeds && (
                    <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                      Превышение на {(areaNum - (available ?? 0)).toFixed(1)} м²
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Тип помещения *</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="cursor-pointer">
                    <input type="radio" name="kind" value="RENTABLE" defaultChecked className="peer sr-only" />
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:dark:bg-emerald-500/10">
                      <p className="font-medium text-slate-900 dark:text-slate-100">Арендуемое</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Кабинет / офис / магазин</p>
                    </div>
                  </label>
                  <label className="cursor-pointer">
                    <input type="radio" name="kind" value="COMMON" className="peer sr-only" />
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs peer-checked:border-slate-500 peer-checked:bg-slate-50 peer-checked:dark:bg-slate-800">
                      <p className="font-medium text-slate-900 dark:text-slate-100">Общая зона</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Коридор / WC / лестница / тех</p>
                    </div>
                  </label>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  Общие зоны не сдаются в аренду и не попадают в список свободных.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Описание</label>
                <input name="description" placeholder="Угловой офис, окна на юг…" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button
                  type="submit"
                  disabled={pending || exceeds}
                  className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60"
                  title={exceeds ? "Площадь превышает доступную на этаже" : undefined}
                >
                  {pending ? "Создание..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function EditSpaceDialog({ space, tenants }: { space: EditableSpace; floors: Floor[]; tenants: TenantOption[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(space.status)
  const [tenantId, setTenantId] = useState(space.tenant?.id ?? "")
  const occupiedTenant = space.tenant ?? null
  const requiresTenant = status === "OCCUPIED" && !occupiedTenant
  const cannotRelease = !!occupiedTenant && status !== "OCCUPIED"
  const cannotSave = cannotRelease || (requiresTenant && !tenantId)

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
        <Edit2 className="h-3 w-3" />
        Изменить
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Редактировать помещение</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    await updateSpace(space.id, fd)
                    toast.success("Изменения сохранены")
                    setOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Номер</label>
                  <input name="number" defaultValue={space.number} required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Площадь, м²</label>
                  <input name="area" type="number" step="0.1" defaultValue={space.area} required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Статус</label>
                <select
                  name="status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {status === "OCCUPIED" && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-500/30 dark:bg-blue-500/10">
                  {occupiedTenant ? (
                    <>
                      <p className="font-medium text-blue-900 dark:text-blue-200">Помещение уже занято</p>
                      <p className="mt-1 text-blue-700 dark:text-blue-300">
                        Арендатор: <a href={`/admin/tenants/${occupiedTenant.id}`} className="underline hover:no-underline">{occupiedTenant.companyName}</a>
                      </p>
                      <input type="hidden" name="tenantId" value={occupiedTenant.id} />
                    </>
                  ) : (
                    <>
                      <label className="block text-xs font-medium text-blue-900 dark:text-blue-200 mb-1.5">
                        Кем занято *
                      </label>
                      <select
                        name="tenantId"
                        required
                        value={tenantId}
                        onChange={(event) => setTenantId(event.target.value)}
                        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-blue-500/30 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="">Выберите арендатора</option>
                        {tenants.map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>
                            {tenant.companyName}{tenant.placement ? ` · ${tenant.placement}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-blue-700 dark:text-blue-300">
                        Статус “занято” сохраняется только вместе с привязкой арендатора.
                      </p>
                    </>
                  )}
                </div>
              )}
              {cannotRelease && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  Нельзя освободить помещение простой сменой статуса. Сначала откройте карточку арендатора
                  «{occupiedTenant.companyName}» и снимите помещение или завершите договор.
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Описание</label>
                <input name="description" defaultValue={space.description ?? ""} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button
                  type="submit"
                  disabled={pending || cannotSave}
                  title={cannotSave ? "Проверьте правило занятости помещения" : undefined}
                  className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60"
                >
                  {pending ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function DeleteSpaceButton({ spaceId, hasTenant }: { spaceId: string; hasTenant: boolean }) {
  return (
    <DeleteAction
      action={async () => {
        const r = await deleteSpace(spaceId)
        if (r && "error" in r && r.error) throw new Error(r.error)
      }}
      entity="помещение"
      successMessage="Помещение удалено"
      disabled={hasTenant}
    />
  )
}
