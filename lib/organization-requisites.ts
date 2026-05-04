import { db } from "@/lib/db"
import { LANDLORD } from "@/lib/landlord"

export const ORGANIZATION_REQUISITES_SELECT = {
  id: true,
  name: true,
  legalType: true,
  legalName: true,
  shortName: true,
  bin: true,
  iin: true,
  directorName: true,
  directorPosition: true,
  basis: true,
  legalAddress: true,
  actualAddress: true,
  bankName: true,
  iik: true,
  bik: true,
  phone: true,
  email: true,
} as const

type OrganizationRequisitesRecord = {
  name: string
  legalType: string | null
  legalName: string | null
  shortName: string | null
  bin: string | null
  iin: string | null
  directorName: string | null
  directorPosition: string | null
  basis: string | null
  legalAddress: string | null
  actualAddress: string | null
  bankName: string | null
  iik: string | null
  bik: string | null
  phone: string | null
  email: string | null
}

export type OrganizationRequisites = {
  fullName: string
  shortName: string
  legalType: string
  bin: string
  iin: string
  taxId: string
  taxIdLabel: "БИН" | "ИИН" | "ИИН/БИН"
  director: string
  directorShort: string
  directorPosition: string
  basis: string
  legalAddress: string
  actualAddress: string
  iik: string
  bik: string
  bank: string
  phone: string
  email: string
}

export async function getOrganizationRequisites(orgId: string): Promise<OrganizationRequisites> {
  const organization = await db.organization.findUnique({
    where: { id: orgId },
    select: ORGANIZATION_REQUISITES_SELECT,
  })

  return organizationToRequisites(organization)
}

export function organizationToRequisites(
  organization: OrganizationRequisitesRecord | null | undefined,
): OrganizationRequisites {
  const hasRequisites = hasCustomRequisites(organization)
  const legalType = hasRequisites ? normalizeLegalType(organization?.legalType) : "IP"
  const fullName = hasRequisites
    ? clean(organization?.legalName) ?? clean(organization?.name) ?? LANDLORD.fullName
    : LANDLORD.fullName
  const shortName = hasRequisites
    ? clean(organization?.shortName) ?? fullName
    : LANDLORD.shortName
  const director = hasRequisites ? clean(organization?.directorName) ?? LANDLORD.director : LANDLORD.director
  const taxId = hasRequisites ? clean(organization?.bin) ?? clean(organization?.iin) ?? LANDLORD.iin : LANDLORD.iin
  const taxIdLabel = taxIdLabelFor(legalType, organization)

  return {
    fullName,
    shortName,
    legalType,
    bin: hasRequisites ? clean(organization?.bin) ?? "" : "",
    iin: hasRequisites ? clean(organization?.iin) ?? clean(organization?.bin) ?? LANDLORD.iin : LANDLORD.iin,
    taxId,
    taxIdLabel,
    director,
    directorShort: shortPersonName(director) ?? LANDLORD.directorShort,
    directorPosition: hasRequisites ? clean(organization?.directorPosition) ?? "Директор" : "Директор",
    basis: hasRequisites ? clean(organization?.basis) ?? defaultBasisFor(legalType) ?? LANDLORD.basis : LANDLORD.basis,
    legalAddress: hasRequisites ? clean(organization?.legalAddress) ?? clean(organization?.actualAddress) ?? LANDLORD.legalAddress : LANDLORD.legalAddress,
    actualAddress: hasRequisites ? clean(organization?.actualAddress) ?? clean(organization?.legalAddress) ?? LANDLORD.legalAddress : LANDLORD.legalAddress,
    iik: hasRequisites ? clean(organization?.iik) ?? LANDLORD.iik : LANDLORD.iik,
    bik: hasRequisites ? clean(organization?.bik)?.toUpperCase() ?? LANDLORD.bik : LANDLORD.bik,
    bank: hasRequisites ? clean(organization?.bankName) ?? LANDLORD.bank : LANDLORD.bank,
    phone: hasRequisites ? clean(organization?.phone) ?? LANDLORD.phone : LANDLORD.phone,
    email: hasRequisites ? clean(organization?.email) ?? LANDLORD.email : LANDLORD.email,
  }
}

function clean(value: unknown) {
  const text = String(value ?? "").trim()
  return text.length > 0 ? text : null
}

function normalizeLegalType(value: string | null | undefined) {
  const type = String(value ?? "").trim().toUpperCase()
  return ["IP", "TOO", "AO", "PHYSICAL", "OTHER"].includes(type) ? type : "IP"
}

function hasCustomRequisites(organization: OrganizationRequisitesRecord | null | undefined) {
  if (!organization) return false
  const meaningful = [
    organization.legalType,
    organization.bin,
    organization.iin,
    organization.directorName,
    organization.directorPosition,
    organization.basis,
    organization.legalAddress,
    organization.actualAddress,
    organization.bankName,
    organization.iik,
    organization.bik,
    organization.phone,
    organization.email,
  ]
  if (meaningful.some((value) => !!clean(value))) return true

  const name = clean(organization.name)
  const legalName = clean(organization.legalName)
  const shortName = clean(organization.shortName)
  return (!!legalName && legalName !== name) || (!!shortName && shortName !== name)
}

function taxIdLabelFor(
  legalType: string,
  organization: OrganizationRequisitesRecord | null | undefined,
): "БИН" | "ИИН" | "ИИН/БИН" {
  if (legalType === "TOO" || legalType === "AO") return "БИН"
  if (legalType === "IP" || legalType === "PHYSICAL") return "ИИН"
  if (clean(organization?.bin) && !clean(organization?.iin)) return "БИН"
  if (clean(organization?.iin) && !clean(organization?.bin)) return "ИИН"
  return "ИИН/БИН"
}

function defaultBasisFor(legalType: string) {
  if (legalType === "TOO" || legalType === "AO") return "Устава"
  if (legalType === "IP") return "уведомления о начале деятельности"
  return null
}

function shortPersonName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  const [last, first, middle] = parts
  const initials = [first, middle].filter(Boolean).map((part) => `${part[0]}.`).join("")
  return `${last} ${initials}`.trim()
}
