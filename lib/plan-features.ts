import { db } from "@/lib/db"
import type { PlanCapabilityKey } from "@/lib/plan-capabilities"

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
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

export async function hasFeature(orgId: string, key: FeatureKey): Promise<boolean> {
  const features = await getOrgFeatures(orgId)
  return features[key] === true
}
