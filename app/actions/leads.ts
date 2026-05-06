"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { audit } from "@/lib/audit"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess, checkLimit, requireSubscriptionActive } from "@/lib/org"
import { assertLeadInOrg, assertSpaceInOrg, assertBuildingInOrg } from "@/lib/scope-guards"

export async function createLead(formData: FormData) {
  await requireCapabilityAndFeature("leads.manage")
  const { orgId } = await requireOrgAccess()
  await requireSubscriptionActive(orgId)
  await checkLimit(orgId, "leads")

  const buildingId = await getCurrentBuildingId()
  if (!buildingId) throw new Error("Здание не выбрано")
  await assertBuildingInOrg(buildingId, orgId)

  const name = String(formData.get("name") ?? "").trim()
  const contact = String(formData.get("contact") ?? "").trim()
  if (!name) throw new Error("Имя обязательно")
  if (!contact) throw new Error("Контакт обязателен")

  const lead = await db.lead.create({
    data: {
      buildingId,
      name,
      contact,
      contactType: contact.includes("@") ? "EMAIL" : "PHONE",
      companyName: String(formData.get("companyName") ?? "").trim() || null,
      legalType: String(formData.get("legalType") ?? "").trim() || null,
      desiredArea: parseFloat(String(formData.get("desiredArea") ?? "")) || null,
      budget: parseFloat(String(formData.get("budget") ?? "")) || null,
      source: String(formData.get("source") ?? "OTHER"),
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  })

  await audit({ action: "CREATE", entity: "lead", entityId: lead.id, details: { name, contact } })
  revalidatePath("/admin/leads")
  return lead
}

export async function updateLeadStatus(leadId: string, status: string) {
  await requireCapabilityAndFeature("leads.manage")
  const { orgId } = await requireOrgAccess()
  await assertLeadInOrg(leadId, orgId)

  await db.lead.update({ where: { id: leadId }, data: { status } })
  await audit({ action: "UPDATE", entity: "lead", entityId: leadId, details: { status } })
  revalidatePath("/admin/leads")
}

export async function bookSpaceForLead(leadId: string, spaceId: string, days = 7) {
  await requireCapabilityAndFeature("leads.bookSpace")
  const { orgId } = await requireOrgAccess()
  await assertLeadInOrg(leadId, orgId)
  await assertSpaceInOrg(spaceId, orgId)

  // Нельзя забронировать помещение на полностью арендованном этаже
  const { assertSpaceAssignable } = await import("@/lib/full-floor-guards")
  await assertSpaceAssignable(spaceId)

  const bookedUntil = new Date(Date.now() + days * 24 * 3600 * 1000)
  await db.lead.update({ where: { id: leadId }, data: { spaceId, bookedUntil } })
  await db.space.update({ where: { id: spaceId }, data: { status: "MAINTENANCE" } })
  await audit({ action: "UPDATE", entity: "lead", entityId: leadId, details: { booked: spaceId, days } })
  revalidatePath("/admin/leads")
  revalidatePath("/admin/spaces")
}

export async function unbookSpaceForLead(leadId: string) {
  await requireCapabilityAndFeature("leads.bookSpace")
  const { orgId } = await requireOrgAccess()
  await assertLeadInOrg(leadId, orgId)

  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { spaceId: true } })
  if (lead?.spaceId) {
    await db.space.update({ where: { id: lead.spaceId }, data: { status: "VACANT" } })
  }
  await db.lead.update({ where: { id: leadId }, data: { spaceId: null, bookedUntil: null } })
  revalidatePath("/admin/leads")
  revalidatePath("/admin/spaces")
}

export async function deleteLead(leadId: string) {
  await requireCapabilityAndFeature("leads.manage")
  const { orgId } = await requireOrgAccess()
  await assertLeadInOrg(leadId, orgId)

  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { spaceId: true } })
  if (lead?.spaceId) {
    await db.space.update({ where: { id: lead.spaceId }, data: { status: "VACANT" } })
  }
  await db.lead.delete({ where: { id: leadId } })
  await audit({ action: "DELETE", entity: "lead", entityId: leadId })
  revalidatePath("/admin/leads")
}
