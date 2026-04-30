"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Upload, Loader2, FileText, X, Download, AlertCircle, Info, ChevronDown } from "lucide-react"
import {
  uploadDocumentTemplate,
  removeDocumentTemplate,
  type UploadTemplateResult,
} from "@/app/actions/document-templates"
import { PLACEHOLDER_DOCS, type DocumentType } from "@/lib/template-engine"

interface ActiveTemplate {
  id: string
  format: string
  fileName: string
  fileSize: number
  uploadedAt: Date
}

interface Props {
  documentType: DocumentType
  active: ActiveTemplate | null
}

const TYPE_LABELS: Record<DocumentType, string> = {
  CONTRACT: "договор аренды",
  INVOICE: "счёт на оплату",
  ACT: "акт оказанных услуг",
  RECONCILIATION: "акт сверки",
}

export function CustomTemplateBlock({ documentType, active }: Props) {
  const [pending, startTransition] = useTransition()
  const [uploadResult, setUploadResult] = useState<UploadTemplateResult | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  function handleFile(file: File | undefined) {
    if (!file) return
    const fd = new FormData()
    fd.append("file", file)
    startTransition(async () => {
      try {
        const r = await uploadDocumentTemplate(documentType, fd)
        setUploadResult(r)
        if (r.ok) toast.success("Шаблон загружен")
        else toast.error(r.error ?? "Ошибка")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка")
      }
    })
  }

  function remove() {
    if (!confirm("Удалить кастомный шаблон? Будет использоваться стандартный.")) return
    startTransition(async () => {
      await removeDocumentTemplate(documentType)
      toast.success("Шаблон удалён, используется стандартный")
      setUploadResult(null)
    })
  }

  const placeholders = PLACEHOLDER_DOCS[documentType]

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 print:hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Свой шаблон документа</h3>
        </div>
        {active && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Активен ({active.format})
          </span>
        )}
      </div>

      <div className="p-5 space-y-3">
        {active ? (
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex items-center gap-3">
            <FileText className="h-5 w-5 text-slate-400 dark:text-slate-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{active.fileName}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {active.format} · {Math.round(active.fileSize / 1024)} КБ · загружен {new Date(active.uploadedAt).toLocaleDateString("ru-RU")}
              </p>
            </div>
            <a
              href={`/api/templates/${documentType.toLowerCase()}`}
              download
              className="rounded-md border border-slate-200 dark:border-slate-800 hover:bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1"
              title="Скачать оригинал шаблона"
            >
              <Download className="h-3 w-3" />
            </a>
            <button onClick={remove} disabled={pending} className="rounded-md border border-red-200 text-red-600 hover:bg-red-50 px-2.5 py-1 text-xs font-medium inline-flex items-center gap-1">
              <X className="h-3 w-3" />
              Удалить
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">
            Сейчас используется <b>стандартный шаблон</b>. Загрузите свой <b>DOCX</b> или <b>XLSX</b> с метками вида <code className="px-1 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono">{`{tenant_name}`}</code> — и все документы будут формироваться по нему. PDF принимается как образец-превью.
          </p>
        )}

        <label className={`block border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition ${
          pending ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/30"
        }`}>
          <input
            type="file"
            accept=".docx,.xlsx,.pdf"
            onChange={(e) => handleFile(e.target.files?.[0])}
            disabled={pending}
            className="hidden"
          />
          {pending ? (
            <div className="flex items-center justify-center gap-2 text-sm text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем шаблон...
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Upload className="h-6 w-6 text-slate-400 dark:text-slate-500" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {active ? "Заменить новой версией" : "Перетащите файл или нажмите чтобы выбрать"}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">DOCX, XLSX или PDF · до 10 МБ</p>
            </div>
          )}
        </label>

        {uploadResult?.ok && uploadResult.detectedPlaceholders && uploadResult.detectedPlaceholders.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs">
            <p className="font-semibold text-emerald-900 mb-1">Найдено {uploadResult.detectedPlaceholders.length} меток для подстановки:</p>
            <p className="text-emerald-800 font-mono break-all">
              {uploadResult.detectedPlaceholders.map((p) => `{${p}}`).join(", ")}
            </p>
          </div>
        )}

        {uploadResult?.warning && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-amber-600 shrink-0" />
            <p className="text-amber-800">{uploadResult.warning}</p>
          </div>
        )}

        {/* Подсказка с placeholder'ами */}
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
        >
          <Info className="h-3 w-3" />
          {showHelp ? "Скрыть" : "Показать"} доступные метки для {TYPE_LABELS[documentType]}
          <ChevronDown className={`h-3 w-3 transition ${showHelp ? "rotate-180" : ""}`} />
        </button>

        {showHelp && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 text-xs">
            <p className="text-blue-900">
              Откройте свой шаблон в Word/Excel и в нужных местах вместо данных вставьте метку из списка ниже:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
              {placeholders.map((p) => (
                <div key={p.key} className="flex items-baseline gap-2">
                  <code className="text-[10px] font-mono bg-white dark:bg-slate-900 border border-blue-200 px-1.5 py-0.5 rounded text-blue-700">
                    {`{${p.key}}`}
                  </code>
                  <span className="text-blue-900">— {p.label}</span>
                </div>
              ))}
            </div>
            <p className="text-blue-800 mt-3">
              <b>Пример:</b> в шаблоне договора напишите{" "}
              <code className="bg-white dark:bg-slate-900 border border-blue-200 px-1 rounded">«Арендатор: {`{tenant_name}`} (БИН {`{tenant_bin}`})»</code>
              — система при генерации подставит реальные данные конкретного арендатора.
            </p>
            <p className="text-blue-800">
              Для повторяющихся данных (списки услуг) используйте конструкцию{" "}
              <code className="bg-white dark:bg-slate-900 border border-blue-200 px-1 rounded text-[10px]">{`{#items}{name} — {amount}{/items}`}</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
