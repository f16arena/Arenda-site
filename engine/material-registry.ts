// ADR: Кэш PBR-материалов Babylon, создаваемых из чистых MaterialDef (lib/builder/materials).
// Один материал на id, переиспользуется всеми мешами — меньше draw calls и аллокаций.

import { Color3, PBRMaterial, type Scene } from "@babylonjs/core"
import { MATERIALS } from "@/lib/builder/materials"

export class MaterialRegistry {
  private cache = new Map<string, PBRMaterial>()
  constructor(private scene: Scene) {}

  get(id: string | undefined): PBRMaterial {
    const key = id && MATERIALS[id] ? id : "concrete"
    const existing = this.cache.get(key)
    if (existing) return existing
    const def = MATERIALS[key]
    const m = new PBRMaterial(`mat_${key}`, this.scene)
    m.albedoColor = Color3.FromHexString(def.color)
    m.metallic = def.metallic
    m.roughness = def.roughness
    m.environmentIntensity = 0.6
    if (def.emissive) m.emissiveColor = Color3.FromHexString(def.emissive)
    if (def.opacity !== undefined && def.opacity < 1) {
      m.alpha = def.opacity
      m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
    }
    this.cache.set(key, m)
    return m
  }

  /** Полупрозрачный материал статуса помещения (для overlay), кэш по цвету. */
  status(hex: string): PBRMaterial {
    const key = `status_${hex}`
    const existing = this.cache.get(key)
    if (existing) return existing
    const m = new PBRMaterial(key, this.scene)
    m.albedoColor = Color3.FromHexString(hex)
    m.emissiveColor = Color3.FromHexString(hex).scale(0.4)
    m.metallic = 0
    m.roughness = 1
    m.alpha = 0.45
    m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
    this.cache.set(key, m)
    return m
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose()
    this.cache.clear()
  }
}
