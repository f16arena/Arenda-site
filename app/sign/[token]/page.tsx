export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { Building2, FileSignature, Check, X, Clock, Lock } from "lucide-react"
import { auth } from "@/auth"
import { getContractByToken } from "@/app/actions/contract-workflow"
import { SignActions } from "./sign-actions"
import { DownloadSigned } from "./download-signed"
import { LANDLORD } from "@/lib/landlord"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { contractPayloadBase64 } from "@/lib/contract-signing-payload"
import { renderContractText, type ContractState } from "@/lib/contract-engine"
import { headers } from "next/headers"
import { egovApi1Url, egovBaseFromEnv } from "@/lib/egov-sign"

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

  // Гибрид-защита: если открыт залогиненный АРЕНДАТОР — это должен быть именно его договор.
  // Иначе (чужой арендатор зашёл под своей сессией) подпись запрещаем. Анонимный доступ
  // по токену остаётся (подпись только ЭЦП со сверкой ИИН/БИН), сотрудники-админы — смотрят.
  const session = await auth()
  const wrongTenant =
    !!session?.user &&
    session.user.role === "TENANT" &&
    session.user.id !== contract.tenant.userId

  if (wrongTenant) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-3">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Договор привязан к другому арендатору</h1>
          <p className="text-sm text-slate-600 mt-2">
            Вы вошли под другим аккаунтом. Выйдите из текущего аккаунта или откройте ссылку
            в режиме, где вы не авторизованы, чтобы подписать договор предназначенной стороной.
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/signout" className="inline-block mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Выйти из аккаунта
          </a>
        </div>
      </div>
    )
  }

  const isCompleted = contract.status === "SIGNED" || contract.status === "REJECTED"
  const tenantSigned = !!contract.signedByTenantAt
  const landlordSigned = !!contract.signedByLandlordAt
  const documentTitle = contract.type === "ADDENDUM" ? "Доп. соглашение" : "Договор"
  const documentTextTitle = contract.type === "ADDENDUM" ? "Текст доп. соглашения" : "Текст договора"
  const landlord = contract.tenant.user.organizationId
    ? await getOrganizationRequisites(contract.tenant.user.organizationId)
    : null
  // Для ПОКАЗА арендатору рендерим полный документ (с приложениями) из снимка
  // конструктора — это работает и для старых договоров, где приложений нет в
  // сохранённом content. Подпись же по-прежнему привязана к content (ниже), её не
  // трогаем. Если снимка нет (или ошибка) — показываем content как раньше.
  let displayText = contract.content
  if (contract.builderState) {
    try {
      displayText = renderContractText(contract.builderState as unknown as ContractState)
    } catch {
      displayText = contract.content
    }
  }
  const publicContractContent = redactOwnerContact(displayText, [
    LANDLORD.phone,
    LANDLORD.email,
    landlord?.phone ?? "",
    landlord?.email ?? "",
  ])

  // Канонический текст для ЭЦП считаем по ПОЛНОМУ контенту (тот же, что подпишет
  // арендодатель), а не по версии с замазанными контактами.
  const signingPayloadB64 = contractPayloadBase64({
    number: contract.number,
    type: contract.type,
    content: contract.content,
    startDate: contract.startDate,
    endDate: contract.endDate,
    tenantCompany: contract.tenant.companyName,
  })

  // URL API №1 для подписи через eGov Mobile (QR/диплинк). Домен должен быть в
  // «доверенных» у eGov Mobile. Префикс берём из env (прод-домен) или из запроса.
  const h = await headers()
  const proto = h.get("x-forwarded-proto") ?? "https"
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? ""
  const egovOrigin = egovBaseFromEnv() ?? (host ? `${proto}://${host}` : "")
  const egovApi1 = egovOrigin ? egovApi1Url(egovOrigin, token) : null

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

        {/* Ссылка устарела */}
        {!isCompleted && contract.signLinkExpired && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
            <p className="text-sm font-semibold text-amber-900">Ссылка устарела</p>
            <p className="text-xs text-amber-700 mt-1">
              Срок действия ссылки на подпись истёк. Попросите арендодателя отправить договор повторно.
            </p>
          </div>
        )}

        {/* Действия */}
        {!isCompleted && !tenantSigned && !contract.signLinkExpired && (
          <SignActions token={token} payloadB64={signingPayloadB64} egovApi1Url={egovApi1} />
        )}

        {/* Подписано обеими сторонами → даём скачать готовый документ */}
        {contract.status === "SIGNED" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Готовый документ</p>
            <DownloadSigned token={token} />
            <p className="mt-2 text-[11px] text-slate-400">
              PDF со штампами ЭЦП обеих сторон и QR-кодом для проверки подлинности.
            </p>
          </div>
        )}

        {/* Арендатор подписал, ждём арендодателя */}
        {!isCompleted && tenantSigned && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
            <p className="text-sm font-semibold text-emerald-900">Вы подписали договор</p>
            <p className="text-xs text-emerald-700 mt-1">
              Ожидаем подпись арендодателя. После неё здесь появится кнопка скачать готовый договор.
            </p>
          </div>
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
