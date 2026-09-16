export const dynamic = "force-dynamic"

import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import { openBuildingModel } from "@/app/actions/building-model"
import { BuilderApp } from "@/components/builder/BuilderApp"

/**
 * Конструктор здания. Одна модель на здание: открывается всегда она же,
 * сохраняется в неё же. Первый вход собирает стартовую модель из данных,
 * дальше владелец строит сам.
 */
export default async function BuildingBuilderPage({
  params,
}: {
  params: Promise<{ buildingId: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { buildingId } = await params

  let model
  try {
    model = await openBuildingModel(buildingId)
  } catch {
    notFound()
  }

  return <BuilderApp initialProjectId={model.projectId} />
}
