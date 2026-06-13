export const dynamic = "force-dynamic"

import { BuilderApp } from "@/components/builder/BuilderApp"

/**
 * Commrent Building Studio — игровой 3D Build Mode (Babylon.js). Живёт под /admin,
 * т.к. proxy.ts пускает на поддомене организации только рабочую зону (/admin, /cabinet,
 * /api). Гейтинг (сессия + не-арендатор) обеспечивает admin/layout. ?project=<id>
 * открывает сохранённый проект, иначе — demo. Док: docs/building-studio.
 */
export default async function BuilderPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams
  return <BuilderApp initialProjectId={sp.project} />
}
