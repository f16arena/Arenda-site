export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { BuilderApp } from "@/components/builder/BuilderApp"

/**
 * Commrent Building Studio — игровой 3D Build Mode (Babylon.js). Полноэкранный
 * редактор: demo-сцена, тулбар, уровни, свойства, каталог, камеры. Док: docs/building-studio.
 */
export default async function BuilderPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  return <BuilderApp />
}
