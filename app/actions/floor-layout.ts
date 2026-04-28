"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function saveFloorLayout(floorId: string, layoutJson: string) {
  await db.floor.update({
    where: { id: floorId },
    data: { layoutJson },
  })

  revalidatePath("/admin/spaces")
  revalidatePath(`/admin/floors/${floorId}`)
  return { success: true }
}
