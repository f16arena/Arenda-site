import { auth } from "@/auth"
import { redirect } from "next/navigation"

export const ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "TENANT"] as const
export type Role = (typeof ROLES)[number]

export async function requireRole(allowed: Role[]): Promise<{ id: string; role: Role }> {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const role = session.user.role as Role
  if (!allowed.includes(role)) redirect("/admin")
  return { id: session.user.id, role }
}

export async function requireOwner() {
  return requireRole(["OWNER"])
}

export async function requireAdmin() {
  return requireRole(["OWNER", "ADMIN"])
}

export async function requireStaff() {
  return requireRole(["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER"])
}
