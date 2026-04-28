"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function respondToComplaint(id: string, formData: FormData) {
  const response = formData.get("response") as string
  await db.complaint.update({
    where: { id },
    data: { response, status: "REVIEWED" },
  })
  revalidatePath("/admin/complaints")
  return { success: true }
}

export async function resolveComplaint(id: string) {
  await db.complaint.update({
    where: { id },
    data: { status: "RESOLVED" },
  })
  revalidatePath("/admin/complaints")
  return { success: true }
}
