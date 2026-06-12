import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { storeBufferFile } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const MODEL_MAX_BYTES = 8 * 1024 * 1024 // 8 МБ — типичная GLB-модель мебели/здания
const MODEL_MIME = new Set(["model/gltf-binary", "model/gltf+json", "application/octet-stream"])

/**
 * Импорт 3D-модели (GLB/GLTF из SketchUp/Blender и т.п.) как предмета здания.
 * Принимает { dataUrl, fileName, level, x, z }, сохраняет файл и создаёт
 * BuildingDecor kind="custom" со ссылкой на модель.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  const { id: buildingId } = await params
  await assertBuildingInOrg(buildingId, orgId)

  let body: { dataUrl?: string; fileName?: string; level?: string; x?: number; z?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  const dataUrl = body.dataUrl
  if (!dataUrl || typeof dataUrl !== "string") {
    return NextResponse.json({ error: "Ожидался файл модели" }, { status: 400 })
  }
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return NextResponse.json({ error: "Неподдерживаемый формат" }, { status: 400 })
  const mime = m[1]
  const bytes = Buffer.from(m[2], "base64")
  const fileName = (body.fileName && /\.(glb|gltf)$/i.test(body.fileName)) ? body.fileName : "model.glb"

  // .glb часто отдаётся браузером как octet-stream — допускаем по расширению.
  if (!MODEL_MIME.has(mime) && !/\.(glb|gltf)$/i.test(fileName)) {
    return NextResponse.json({ error: "Поддерживаются только файлы .glb / .gltf" }, { status: 415 })
  }
  if (bytes.length > MODEL_MAX_BYTES) {
    return NextResponse.json({ error: "Модель больше 8 МБ — упростите или уменьшите" }, { status: 413 })
  }

  let stored: { id: string; url: string }
  try {
    stored = await storeBufferFile({
      organizationId: orgId,
      buildingId,
      fileName,
      mimeType: "model/gltf-binary",
      bytes,
      ownerType: "BUILDING_MODEL",
      category: "OTHER",
      visibility: "ADMIN_ONLY",
      uploadedById: session.user.id,
      maxBytes: MODEL_MAX_BYTES,
      allowedMimeTypes: new Set(["model/gltf-binary"]),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось сохранить модель" }, { status: 500 })
  }

  const level = typeof body.level === "string" && body.level.trim() ? body.level.trim().slice(0, 64) : "ground"
  const decor = await db.buildingDecor.create({
    data: {
      buildingId,
      kind: "custom",
      x: Number.isFinite(body.x) ? (body.x as number) : 0,
      z: Number.isFinite(body.z) ? (body.z as number) : 0,
      rot: 0,
      scale: 1,
      level,
      onRoof: level === "roof",
      modelUrl: stored.url,
    },
  })

  return NextResponse.json({ id: decor.id, modelUrl: stored.url })
}
