export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import {
  Building2, Layers, Users, FileText, Sparkles, ArrowRight, Check, Upload,
} from "lucide-react"

// Welcome-страница для нового клиента сразу после регистрации.
// Показывает прогресс: какие шаги уже сделаны, какие предстоят.
export default async function OnboardingPage() {
  const session = await auth()
  if (!session) redirect("/login")
  const { orgId } = await requireOrgAccess()

  const [org, building, tenants, contracts] = await Promise.all([
    db.organization.findUnique({
      where: { id: orgId },
      select: { name: true, planExpiresAt: true, plan: { select: { name: true, code: true } } },
    }),
    db.building.findFirst({ where: { organizationId: orgId }, select: { id: true, name: true } }),
    db.tenant.count({ where: { space: { floor: { building: { organizationId: orgId } } } } }).catch(() => 0),
    db.contract.count({ where: { tenant: { space: { floor: { building: { organizationId: orgId } } } } } }).catch(() => 0),
  ])

  const isTrial = org?.plan?.code === "TRIAL"
  const daysLeft = org?.planExpiresAt
    ? Math.max(0, Math.ceil((org.planExpiresAt.getTime() - Date.now()) / 86_400_000))
    : null

  // Считаем прогресс
  const steps = [
    { done: !!building, label: "Создать здание", href: "/admin/buildings", icon: Building2 },
    { done: !!building, label: "Настроить этажи и ставки", href: building ? `/admin/floors/` : "/admin/buildings", icon: Layers },
    { done: tenants > 0, label: `Добавить арендаторов${tenants > 0 ? ` (${tenants})` : ""}`, href: "/admin/import/tenants", icon: Users },
    { done: contracts > 0, label: `Создать договоры${contracts > 0 ? ` (${contracts})` : ""}`, href: "/admin/contracts", icon: FileText },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const allDone = doneCount === steps.length

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Welcome banner */}
      <div className="bg-gradient-to-br from-blue-50 via-purple-50 to-emerald-50 border border-blue-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Добро пожаловать{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}!
            </h1>
            <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
              Аккаунт <b>{org?.name}</b> создан.{" "}
              {isTrial && daysLeft !== null && (
                <span className="text-blue-700 font-medium">
                  Триал: {daysLeft} {daysLeft === 1 ? "день" : daysLeft >= 2 && daysLeft <= 4 ? "дня" : "дней"} осталось.
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-2">
              Тариф: <span className="font-medium text-slate-700 dark:text-slate-300">{org?.plan?.name ?? "—"}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Прогресс */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Запуск за 4 шага</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{doneCount} из {steps.length} готово</p>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>

        {/* Steps */}
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i}>
              <Link
                href={s.href}
                className={`flex items-center gap-4 p-4 rounded-xl border transition ${
                  s.done
                    ? "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 hover:bg-blue-50/30"
                }`}
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                  s.done ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500"
                }`}>
                  {s.done ? <Check className="h-4 w-4" /> : <span className="text-sm font-semibold">{i + 1}</span>}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${s.done ? "text-emerald-900" : "text-slate-900 dark:text-slate-100"}`}>
                    {s.label}
                  </p>
                </div>
                <ArrowRight className={`h-4 w-4 ${s.done ? "text-emerald-600" : "text-slate-400 dark:text-slate-500"}`} />
              </Link>
            </li>
          ))}
        </ol>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/import/tenants"
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:border-blue-300 hover:shadow-sm transition group"
        >
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition">
              <Upload className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Импорт из Excel</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">
                Уже есть список арендаторов в Excel или 1С? Загрузите файл — добавим за минуту.
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/buildings"
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:border-purple-300 hover:shadow-sm transition group"
        >
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition">
              <Building2 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Создать здание</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">
                Начните с нуля: добавьте здание, этажи и помещения вручную.
              </p>
            </div>
          </div>
        </Link>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Можете <Link href="/admin" className="underline hover:text-slate-600 dark:text-slate-400 dark:text-slate-500">пропустить и сразу перейти в систему</Link>
      </p>

      {allDone && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <Check className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800">
            Всё готово! Можете переходить к <Link href="/admin" className="font-semibold underline">основной панели</Link>.
          </p>
        </div>
      )}
    </div>
  )
}
