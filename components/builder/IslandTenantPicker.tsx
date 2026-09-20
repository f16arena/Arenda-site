"use client"

// «Арендатор места» в панели киоска/навеса/антенны: список всех арендаторов
// здания — и новых без помещения тоже (раньше в списке были только карточки
// помещений, нового арендатора посадить на место было нельзя).
// Выбор: нет карточки места — заводим её, затем сажаем арендатора.

import { useEffect, useState } from "react"
import { assignTenantToPlace, listBuilderTenants, listBuildingPremises, type BuilderTenantOption } from "@/app/actions/builder-premise"
import { usePremiseStore } from "@/store/premise-store"
import { TOKENS } from "@/lib/builder/materials"
import { PremisePicker } from "./PremisePicker"

export function IslandTenantPicker({
  buildingId,
  premiseId,
  currentTenant,
  ensurePremise,
  linkPremise,
}: {
  buildingId: string
  premiseId: string | null
  currentTenant: string | null
  ensurePremise: () => Promise<string | null>
  /** Привязать объект к уже существующей карточке места */
  linkPremise: (spaceId: string) => void
}) {
  const [tenants, setTenants] = useState<BuilderTenantOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listBuilderTenants(buildingId).then((rows) => { if (!cancelled) setTenants(rows) }).catch(() => {})
    return () => { cancelled = true }
  }, [buildingId])

  const current = tenants.find((t) => t.name === currentTenant) ?? null

  async function choose(tenantId: string | null) {
    if (!tenantId || tenantId === current?.id) return
    setBusy(true)
    setError(null)
    try {
      // Если у арендатора уже есть место — привязываем объект к нему, а не
      // заводим вторую карточку (у MTA так появились «Киоск» и «М-4»).
      const name = tenants.find((t) => t.id === tenantId)?.name
      const already = premiseId
        ? null
        : [...usePremiseStore.getState().byId.values()].find((p) => !!name && p.tenantName === name)
      if (already) linkPremise(already.id)
      const spaceId = premiseId ?? already?.id ?? (await ensurePremise())
      if (!spaceId) throw new Error("Не удалось завести карточку места")
      const res = await assignTenantToPlace(tenantId, spaceId)
      if (!res.ok) throw new Error(res.error)
      const [rows, list] = await Promise.all([listBuildingPremises(buildingId), listBuilderTenants(buildingId)])
      usePremiseStore.getState().setRows(rows)
      setTenants(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось посадить арендатора")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <PremisePicker
        label={busy ? "Арендатор места — сохраняю…" : "Арендатор места"}
        items={[...tenants].sort((a, b) => Number(!!a.place) - Number(!!b.place)).map((t) => ({
          id: t.id,
          title: t.name,
          group: t.place ? "С помещением" : "Без места — новые",
          who: t.place,
        }))}
        value={current?.id ?? null}
        emptyLabel={currentTenant ?? "Свободно — выберите арендатора"}
        showFree={false}
        allowClear={false}
        onChange={(id) => void choose(id)}
      />
      {error && <p className="text-[11px]" style={{ color: "#fca5a5" }}>{error}</p>}
      {!error && !premiseId && (
        <p className="text-[10px]" style={{ color: TOKENS.muted }}>Карточка места заведётся сама при выборе арендатора.</p>
      )}
    </div>
  )
}
