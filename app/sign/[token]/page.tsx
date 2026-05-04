export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { Building2, FileSignature, Check, X, Clock } from "lucide-react"
import { getContractByToken } from "@/app/actions/contract-workflow"
import { SignActions } from "./sign-actions"
import { LANDLORD } from "@/lib/landlord"
import { getOrganizationRequisites } from "@/lib/organization-requisites"

function redactOwnerContact(content: string, contacts: string[]) {
  return contacts.reduce((text, value) => {
    if (!value) return text
    return text.split(value).join("скрыто, связь через администратора")
  }, content)
}

export default async function SignContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const contract = await getContractByToken(token)
  if (!contract) notFound()

  const isCompleted = contract.status === "SIGNED" || contract.status === "REJECTED"
  const tenantSigned = !!contract.signedByTenantAt
  const landlordSigned = !!contract.signedByLandlordAt
  const documentTitle = contract.type === "ADDENDUM" ? "Доп. соглашение" : "Договор"
  const documentTextTitle = contract.type === "ADDENDUM" ? "Текст доп. соглашения" : "Текст договора"
  const landlord = contract.tenant.user.organizationId
    ? await getOrganizationRequisites(contract.tenant.user.organizationId)
    : null
  const publicContractContent = redactOwnerContact(contract.content, [
    LANDLORD.phone,
    LANDLORD.email,
    landlord?.phone ?? "",
    landlord?.email ?? "",
  ])

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <header className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {documentTitle} № {contract.number}
                </p>
                <h1 className="text-xl font-bold text-slate-900 mt-0.5">
                  {contract.tenant.companyName}
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {contract.tenant.user.name}
                </p>
              </div>
            </div>
            {/* Статус */}
            <div>
              {contract.status === "SIGNED" && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-semibold">
                  <Check className="h-3.5 w-3.5" /> Подписан обеими сторонами
                </span>
              )}
              {contract.status === "REJECTED" && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-semibold">
                  <X className="h-3.5 w-3.5" /> Отклонён
                </span>
              )}
              {contract.status === "SIGNED_BY_TENANT" && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 text-xs font-semibold">
                  <Clock className="h-3.5 w-3.5" /> Ждёт подписи арендодателя
                </span>
              )}
              {(contract.status === "SENT" || contract.status === "VIEWED") && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-semibold">
                  <FileSignature className="h-3.5 w-3.5" /> Ожидает подписи
                </span>
              )}
            </div>
          </div>
          {/* Параметры */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            {contract.startDate && (
              <div>
                <p className="text-slate-400">Начало</p>
                <p className="text-slate-900 font-medium tabular-nums">{new Date(contract.startDate).toLocaleDateString("ru-RU")}</p>
              </div>
            )}
            {contract.endDate && (
              <div>
                <p className="text-slate-400">Окончание</p>
                <p className="text-slate-900 font-medium tabular-nums">{new Date(contract.endDate).toLocaleDateString("ru-RU")}</p>
              </div>
            )}
            {contract.sentAt && (
              <div>
                <p className="text-slate-400">Отправлен</p>
                <p className="text-slate-900 font-medium">{new Date(contract.sentAt).toLocaleDateString("ru-RU")}</p>
              </div>
            )}
          </div>
        </header>

        {/* Прогресс */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Подписи сторон</p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full ${tenantSigned ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                {tenantSigned ? <Check className="h-3.5 w-3.5" /> : <span className="text-xs font-bold">1</span>}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">Арендатор</p>
                {tenantSigned ? (
                  <p className="text-xs text-emerald-600">
                    Подписал {new Date(contract.signedByTenantAt!).toLocaleDateString("ru-RU")}
                    {contract.signedByTenantName ? ` · ${contract.signedByTenantName}` : ""}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">Ваша очередь подписать</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full ${landlordSigned ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                {landlordSigned ? <Check className="h-3.5 w-3.5" /> : <span className="text-xs font-bold">2</span>}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">Арендодатель</p>
                {landlordSigned ? (
                  <p className="text-xs text-emerald-600">
                    Подписал {new Date(contract.signedByLandlordAt!).toLocaleDateString("ru-RU")}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">Подпишет после арендатора</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Содержимое */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{documentTextTitle}</p>
          <div className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap font-serif">
            {publicContractContent}
          </div>
        </div>

        {/* Действия */}
        {!isCompleted && !tenantSigned && (
          <SignActions token={token} />
        )}

        {contract.status === "REJECTED" && contract.rejectionReason && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-red-900 mb-1">Договор отклонён</p>
            <p className="text-xs text-red-700">{contract.rejectionReason}</p>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          Платформа Commrent · защищено токеном · действия логируются
        </p>
      </div>
    </div>
  )
}
