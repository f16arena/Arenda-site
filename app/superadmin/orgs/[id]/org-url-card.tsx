"use client"

import { useState } from "react"
import { Globe, Copy, Check, ExternalLink } from "lucide-react"

export function OrgUrlCard({ slug, rootHost }: { slug: string; rootHost: string }) {
  const [copied, setCopied] = useState(false)
  const url = `https://${slug}.${rootHost}`

  function copy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-white border border-purple-200 flex items-center justify-center shrink-0">
        <Globe className="h-5 w-5 text-purple-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-purple-700 font-semibold">Рабочая зона организации</p>
        <p className="text-base font-mono text-slate-900 truncate">{url}</p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title="Скопировать URL"
        >
          {copied ? <><Check className="h-3.5 w-3.5 text-emerald-600" /> Скопировано</> : <><Copy className="h-3.5 w-3.5" /> Копировать</>}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-lg bg-purple-600 hover:bg-purple-700 px-2.5 py-1.5 text-xs font-medium text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Открыть
        </a>
      </div>
    </div>
  )
}
