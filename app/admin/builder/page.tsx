export const dynamic = "force-dynamic"

import { BuilderApp } from "@/components/builder/BuilderApp"

/**
 * Commrent Building Studio — игровой 3D Build Mode (Babylon.js). Живёт под /admin,
 * т.к. proxy.ts пускает на поддомене организации только рабочую зону (/admin, /cabinet,
 * /api). Гейтинг (сессия + не-арендатор) обеспечивает admin/layout. Полноэкранный
 * редактор перекрывает админ-каркас через fixed-overlay. Док: docs/building-studio.
 */
export default function BuilderPage() {
  return <BuilderApp />
}
