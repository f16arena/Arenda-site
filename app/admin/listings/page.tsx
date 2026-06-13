export const dynamic = "force-dynamic"

import { Megaphone } from "lucide-react"
import { listListingDrafts } from "@/app/actions/krisha-listing"
import { ListingsTable } from "./listings-client"

export default async function ListingsPage() {
  const rows = await listListingDrafts()

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Объявления</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Подготовка и учёт объявлений на внешних площадках (Krisha)</p>
        </div>
      </div>

      <ListingsTable rows={rows} />
    </div>
  )
}
