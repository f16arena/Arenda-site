// Feature flags из тарифного плана организации.
// Plan.features — JSON со строкой вида {"floorEditor": true, "telegramBot": true, ...}
// Если у организации нет плана / план не задал ключ — фича считается ВЫКЛЮЧЕННОЙ.

import { db } from "@/lib/db"

export type FeatureKey =
  | "emailNotifications"
  | "telegramBot"
  | "floorEditor"      // Визуализация помещения (BETA)
  | "contractTemplates"
  | "bankImport"
  | "excelExport"
  | "export1c"
  | "cmdkSearch"
  | "customDomain"
  | "api"
  | "whiteLabel"
  | "aiAssistant"
  | "prioritySupport"

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
