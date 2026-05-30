"use client"

import { useState, type ReactNode } from "react"
import { FileText, FilePlus2 } from "lucide-react"

function tabBtn(active: boolean): string {
  return `inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
    active
      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
  }`
}

/**
 * Единый центр документов: «Архив» (просмотр) + «Создать» (конструкторы/генерация).
 * Слоты приходят с сервера; вкладка «Создать» монтируется только при выборе
 * (тяжёлые конструкторы не грузятся на «Архиве»).
 */
export function DocumentsHub({ archive, create, canCreate, initialTab = "archive" }: { archive: ReactNode; create: ReactNode; canCreate: boolean; initialTab?: "archive" | "create" }) {
  const [tab, setTab] = useState<"archive" | "create">(canCreate ? initialTab : "archive")
  return (
    <div className="space-y-5">
      {canCreate && (
        <div className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          <button onClick={() => setTab("archive")} className={tabBtn(tab === "archive")}><FileText className="h-4 w-4" /> Документы</button>
          <button onClick={() => setTab("create")} className={tabBtn(tab === "create")}><FilePlus2 className="h-4 w-4" /> Создать</button>
        </div>
      )}
      {tab === "archive" || !canCreate ? archive : create}
    </div>
  )
}
