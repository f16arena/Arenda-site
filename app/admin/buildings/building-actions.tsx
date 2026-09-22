"use client"
import { ModalShell } from "@/components/ui/modal"

import { FIELD_CLS } from "@/lib/ui-fields"
import { useState, useTransition } from "react"
import type { ReactNode } from "react"
import { Plus, X, Edit2, Power, Building2, Layers, ArrowRight, Trash2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import {
  createBuilding,
  updateBuildingDetails,
  toggleBuildingActive,
  deleteBuilding,
  switchBuilding,
  createFloor,
  deleteFloor,
} from "@/app/actions/buildings"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AddressAutocompleteInput } from "@/components/forms/address-autocomplete-input"
import { AsciiEmailInput, KzPhoneInput } from "@/components/forms/contact-inputs"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatMoneyL } from "@/lib/i18n/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { isZoneFloor, type FloorKind } from "@/lib/zone-kinds"

const FIELD_CLASS = FIELD_CLS

export function CreateBuildingButton() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        leftIcon={<Plus className="h-4 w-4" />}
      >
        {t("adminObjects.buildingForm.addButton")}
      </Button>

      <ModalShell open={open} onClose={() => setOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {t("adminObjects.buildingForm.createTitle")}
              </h2>
              <button onClick={() => setOpen(false)} aria-label={t("common.actions.close")}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    await createBuilding(fd)
                    toast.success(t("adminObjects.buildingForm.created"))
                    setOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : t("adminObjects.buildingForm.failed"))
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <Field label={t("adminObjects.buildingForm.name")} name="name" required placeholder={t("adminObjects.buildingForm.namePlaceholder")} />
              <ContactField label={t("adminObjects.buildingForm.address")}>
                <AddressAutocompleteInput name="address" required className={FIELD_CLASS} />
              </ContactField>
              <Field label={t("adminObjects.buildingForm.description")} name="description" placeholder={t("adminObjects.buildingForm.descriptionPlaceholder")} />
              <div className="grid grid-cols-2 gap-3">
                <ContactField label={t("adminObjects.buildingForm.phone")}>
                  <KzPhoneInput name="phone" className={FIELD_CLASS} />
                </ContactField>
                <ContactField label={t("adminObjects.buildingForm.email")}>
                  <AsciiEmailInput name="email" className={FIELD_CLASS} />
                </ContactField>
              </div>
              <div>
                <Field label={t("adminObjects.buildingForm.responsible")} name="responsible" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminObjects.buildingForm.contractPrefix")}</label>
                <Input
                  name="contractPrefix"
                  placeholder="F16"
                  maxLength={10}
                  className="font-mono uppercase"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  {t("adminObjects.buildingForm.contractPrefixHint", { pattern: PREFIX_PATTERN })}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  {pending ? t("adminObjects.buildingForm.creating") : t("adminObjects.buildingForm.create")}
                </Button>
              </div>
            </form>
          </ModalShell>
    </>
  )
}

// Шаблон номера договора одинаков в обоих языках — это формат, а не текст.
const PREFIX_PATTERN = "{префикс}-{год}-{№}"

export function BuildingActions({
  buildingId, isCurrent, isActive, canEdit, canToggle, canDelete, building,
}: {
  buildingId: string
  isCurrent: boolean
  isActive: boolean
  canEdit: boolean
  canToggle: boolean
  canDelete: boolean
  building: {
    name: string
    address: string
    addressCountryCode: string | null
    addressRegion: string | null
    addressCity: string | null
    addressSettlement: string | null
    addressStreet: string | null
    addressHouseNumber: string | null
    addressPostcode: string | null
    addressLatitude: number | null
    addressLongitude: number | null
    addressSource: string | null
    addressSourceId: string | null
    description: string | null
    phone: string | null
    email: string | null
    responsible: string | null
    totalArea: number | null
    contractPrefix: string | null
  }
}) {
  const { t } = useT()
  const [editOpen, setEditOpen] = useState(false)
  const [, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-2">
      {!isCurrent && isActive && (
        <Button
          size="sm"
          onClick={() =>
            startTransition(async () => {
              try {
                await switchBuilding(buildingId)
                toast.success(t("adminObjects.buildingActions.switched"))
              } catch (e) {
                toast.error(e instanceof Error ? e.message : t("adminObjects.buildingActions.error"))
              }
            })
          }
        >
          {t("adminObjects.buildingActions.switch")}
        </Button>
      )}

      {canEdit && (
      <button
        onClick={() => setEditOpen(true)}
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
        title={t("adminObjects.buildingActions.edit")}
      >
        <Edit2 className="h-4 w-4" />
      </button>
      )}

      {canToggle && (
        <ConfirmDialog
          title={isActive ? t("adminObjects.buildingActions.deactivateTitle") : t("adminObjects.buildingActions.activateTitle")}
          description={isActive ? t("adminObjects.buildingActions.deactivateText") : t("adminObjects.buildingActions.activateText")}
          variant={isActive ? "danger" : "default"}
          confirmLabel={isActive ? t("adminObjects.buildingActions.deactivate") : t("adminObjects.buildingActions.activate")}
          cancelLabel={t("common.actions.cancel")}
          onConfirm={() =>
            new Promise<void>((resolve) => {
              startTransition(async () => {
                try {
                  await toggleBuildingActive(buildingId, !isActive)
                  toast.success(isActive ? t("adminObjects.buildingActions.deactivated") : t("adminObjects.buildingActions.activated"))
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : t("adminObjects.buildingActions.error"))
                } finally {
                  resolve()
                }
              })
            })
          }
          trigger={
            <button
              className={isActive ? "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300" : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200"}
              title={isActive ? t("adminObjects.buildingActions.deactivate") : t("adminObjects.buildingActions.activate")}
            >
              <Power className="h-4 w-4" />
            </button>
          }
        />
      )}

      {canDelete && (
        <DeleteIconConfirm
          title={t("adminObjects.buildingActions.deleteTitle")}
          description={t("adminObjects.buildingActions.deleteText")}
          confirmLabel={t("adminObjects.buildingActions.deleteConfirm")}
          ariaLabel={t("adminObjects.buildingActions.deleteAria")}
          successMessage={t("adminObjects.buildingActions.deleted")}
          failMessage={t("adminObjects.buildingActions.deleteFailed")}
          action={() => deleteBuilding(buildingId)}
        />
      )}

      <ModalShell open={editOpen && canEdit} onClose={() => setEditOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">{t("adminObjects.buildingForm.editTitle")}</h2>
              <button onClick={() => setEditOpen(false)} aria-label={t("common.actions.close")}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    await updateBuildingDetails(buildingId, fd)
                    toast.success(t("adminObjects.buildingForm.saved"))
                    setEditOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : t("adminObjects.buildingForm.failed"))
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <Field label={t("adminObjects.buildingForm.name")} name="name" defaultValue={building.name} required />
              <ContactField label={t("adminObjects.buildingForm.address")}>
                <AddressAutocompleteInput
                  name="address"
                  defaultValue={building.address}
                  defaultFields={{
                    countryCode: building.addressCountryCode,
                    region: building.addressRegion,
                    city: building.addressCity,
                    settlement: building.addressSettlement,
                    street: building.addressStreet,
                    houseNumber: building.addressHouseNumber,
                    postcode: building.addressPostcode,
                    latitude: building.addressLatitude,
                    longitude: building.addressLongitude,
                    source: building.addressSource,
                    sourceId: building.addressSourceId,
                  }}
                  required
                  className={FIELD_CLASS}
                />
              </ContactField>
              <Field label={t("adminObjects.buildingForm.description")} name="description" defaultValue={building.description ?? ""} />
              <div className="grid grid-cols-2 gap-3">
                <ContactField label={t("adminObjects.buildingForm.phone")}>
                  <KzPhoneInput name="phone" defaultValue={building.phone} className={FIELD_CLASS} />
                </ContactField>
                <ContactField label={t("adminObjects.buildingForm.email")}>
                  <AsciiEmailInput name="email" defaultValue={building.email} className={FIELD_CLASS} />
                </ContactField>
              </div>
              <div>
                <Field label={t("adminObjects.buildingForm.responsible")} name="responsible" defaultValue={building.responsible ?? ""} />
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                {t("adminObjects.buildingForm.totalAreaNote")}{" "}
                <b className="text-slate-900 dark:text-slate-100 tabular-nums">{building.totalArea ? `${building.totalArea} м²` : t("adminObjects.buildingForm.totalAreaNotSet")}</b>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminObjects.buildingForm.contractPrefix")}</label>
                <Input
                  name="contractPrefix"
                  defaultValue={building.contractPrefix ?? ""}
                  placeholder="F16"
                  maxLength={10}
                  className="font-mono uppercase"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  {t("adminObjects.buildingForm.contractPrefixFormat", {
                    pattern: PREFIX_PATTERN,
                    example: `${building.contractPrefix || "F16"}-${new Date().getFullYear()}-001`,
                  })}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
                <Button type="submit" className="flex-1">
                  {t("common.actions.save")}
                </Button>
              </div>
            </form>
          </ModalShell>
    </div>
  )
}

export function FloorsList({
  buildingId, floors, canCreate, canDelete,
}: {
  buildingId: string
  floors: { id: string; number: number; name: string; kind: string; ratePerSqm: number; totalArea: number | null; spacesCount: number }[]
  canCreate: boolean
  canDelete: boolean
}) {
  const { t, tp } = useT()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [newKind, setNewKind] = useState<FloorKind>("FLOOR")
  const [pending, startTransition] = useTransition()
  const isZone = newKind === "ROOF" || newKind === "TERRITORY"

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          {t("adminObjects.floors.sectionTitle", { count: floors.length })}
        </p>
        {canCreate && (
        <button onClick={() => setOpen(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
          {t("adminObjects.floors.add")}
        </button>
        )}
      </div>
      {floors.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">{t("adminObjects.floors.empty")}</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {floors.map((f) => (
            <div key={f.id} className="rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-blue-50/40 dark:hover:bg-blue-500/5 transition-colors group relative">
              <Link
                href={`/admin/floors/${f.id}`}
                className="block p-3"
                title={t("adminObjects.floors.openHint")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                      {/* этаж с названием-цифрой («1») — подписываем «1 этаж» / «1-қабат» */}
                      <span className="truncate">
                        {/^-?\d+$/.test(f.name.trim())
                          ? t("adminObjects.floors.numberedName", { number: f.name.trim() })
                          : f.name}
                      </span>
                      {f.kind === "ROOF" && f.name.trim().toLowerCase() !== "крыша" && (
                        <Badge className="shrink-0 bg-sky-100 dark:bg-sky-500/20 px-1.5 text-[10px] text-sky-700 dark:text-sky-300">
                          {t("adminObjects.floors.roofBadge")}
                        </Badge>
                      )}
                      {f.kind === "TERRITORY" && f.name.trim().toLowerCase() !== "территория" && (
                        <Badge className="shrink-0 bg-lime-100 dark:bg-lime-500/20 px-1.5 text-[10px] text-lime-700 dark:text-lime-300">
                          {t("adminObjects.floors.territoryBadge")}
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {isZoneFloor(f.kind)
                        ? tp("adminObjects.floors.objectsForRent", f.spacesCount)
                        : tp("adminObjects.floors.spacesWithRate", f.spacesCount, { rate: formatMoneyL(locale, f.ratePerSqm) })}
                    </p>
                    {!isZoneFloor(f.kind) && f.totalArea && <p className="text-xs text-slate-400 dark:text-slate-500">{f.totalArea} м²</p>}
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-500 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                </div>
              </Link>
              {canDelete && (
                <div className="absolute top-2 right-7 opacity-0 group-hover:opacity-100 z-10">
                  <DeleteIconConfirm
                    title={f.spacesCount > 0
                      ? tp("adminObjects.floors.deleteWithSpacesTitle", f.spacesCount)
                      : t("adminObjects.floors.deleteTitle")}
                    description={t("adminObjects.floors.deleteText")}
                    confirmLabel={t("adminObjects.floors.deleteConfirm")}
                    ariaLabel={t("adminObjects.floors.deleteAria")}
                    successMessage={f.spacesCount > 0
                      ? tp("adminObjects.floors.deletedWithSpaces", f.spacesCount)
                      : t("adminObjects.floors.deleted")}
                    failMessage={t("adminObjects.floors.deleteFailed")}
                    action={() => deleteFloor(f.id, { cascade: f.spacesCount > 0 })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ModalShell open={open && canCreate} onClose={() => setOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">
                {newKind === "ROOF"
                  ? t("adminObjects.floors.newRoof")
                  : newKind === "TERRITORY"
                    ? t("adminObjects.floors.newTerritory")
                    : t("adminObjects.floors.newFloor")}
              </h2>
              <button onClick={() => setOpen(false)} aria-label={t("common.actions.close")}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    await createFloor(buildingId, fd)
                    toast.success(isZone ? t("adminObjects.floors.zoneCreated") : t("adminObjects.floors.floorCreated"))
                    setOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : t("adminObjects.buildingForm.failed"))
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminObjects.floors.kind")}</label>
                <select
                  name="kind"
                  value={newKind}
                  onChange={(e) => {
                    const v = e.target.value
                    setNewKind(v === "ROOF" ? "ROOF" : v === "TERRITORY" ? "TERRITORY" : "FLOOR")
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900"
                >
                  <option value="FLOOR">{t("adminObjects.floors.kindFloor")}</option>
                  <option value="ROOF">{t("adminObjects.floors.kindRoof")}</option>
                  <option value="TERRITORY">{t("adminObjects.floors.kindTerritory")}</option>
                </select>
                {isZone && (
                  <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                    {newKind === "ROOF"
                      ? t("adminObjects.floors.roofHint")
                      : t("adminObjects.floors.territoryHint")}
                    {" "}{t("adminObjects.floors.zoneAreaNote")}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("adminObjects.floors.number")} name="number" type="number" placeholder={isZone ? "0" : "1"} required />
                <Field
                  label={t("adminObjects.floors.name")}
                  name="name"
                  placeholder={newKind === "ROOF"
                    ? t("adminObjects.floors.namePlaceholderRoof")
                    : newKind === "TERRITORY"
                      ? t("adminObjects.floors.namePlaceholderTerritory")
                      : t("adminObjects.floors.namePlaceholderFloor")}
                  required
                />
              </div>
              {/* У зон (крыша/территория) нет ставки за м² и площади — объекты сдаются фикс-суммой. */}
              {!isZone && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("adminObjects.floors.rate")} name="ratePerSqm" type="number" step="0.01" placeholder="2500" />
                  <Field label={t("adminObjects.floors.totalArea")} name="totalArea" type="number" step="0.1" />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  {pending ? "..." : t("adminObjects.buildingForm.create")}
                </Button>
              </div>
            </form>
          </ModalShell>
    </div>
  )
}

/**
 * Корзина с подтверждением. Заголовок окна приходит уже переведённым —
 * общий DeleteAction собирает его из русского «Удалить {сущность}?».
 */
function DeleteIconConfirm({
  title, description, confirmLabel, ariaLabel, successMessage, failMessage, action,
}: {
  title: string
  description: string
  confirmLabel: string
  ariaLabel: string
  successMessage: string
  failMessage: string
  action: () => Promise<unknown>
}) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()

  return (
    <ConfirmDialog
      variant="danger"
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={t("common.actions.cancel")}
      onConfirm={() =>
        new Promise<void>((resolve) => {
          startTransition(async () => {
            try {
              const result = await action()
              if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
                toast.error(result.error)
                return
              }
              toast.success(successMessage)
            } catch (e) {
              toast.error(e instanceof Error ? e.message : failMessage)
            } finally {
              resolve()
            }
          })
        })
      }
      trigger={
        <button
          type="button"
          disabled={pending}
          aria-label={ariaLabel}
          className="text-red-400 hover:text-red-600 dark:text-red-400 disabled:opacity-50 inline-flex items-center"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      }
    />
  )
}

function Field({
  label, name, type = "text", required, placeholder, defaultValue, step,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  placeholder?: string
  defaultValue?: string | number | null
  step?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
      <Input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        step={step}
      />
    </div>
  )
}

function ContactField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
