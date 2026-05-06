import { db } from "@/lib/db"
import { parsePlanFeatures, type PlanCapabilityKey } from "@/lib/plan-capabilities"

export type FeatureKey = PlanCapabilityKey

export async function getOrgFeatures(orgId: string): Promise<Record<string, boolean>> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { plan: { select: { features: true } } },
  })
  const raw = org?.plan?.features
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return {}
    return {
      ...(parsed as Record<string, boolean>),
      ...parsePlanFeatures(raw).flags,
    }
  } catch {
    return {}
  }
}

export async function hasFeature(orgId: string, key: FeatureKey): Promise<boolean> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { plan: { select: { features: true } } },
  })
  const raw = org?.plan?.features
  if (!raw) return true
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return true
    if (!Object.prototype.hasOwnProperty.call(parsed, key)) return true
    return parsePlanFeatures(raw).flags[key] === true
  } catch {
    return true
  }
}
