export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import Link from "next/link"
import { Sparkles, Users, Calendar, ExternalLink } from "lucide-react"
import { ROOT_HOST } from "@/lib/host"
import { FoundersStateForm, ReleaseSlotButton, GrantSlotButton } from "./client-actions"

export default async function SuperadminFoundersPage() {
  await requirePlatformOwner()

  const [state, members, eligibleOrgs] = await Promise.all([
    db.foundersProgramState.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    }),
    db.organization.findMany({
      where: { isFoundersMember: true },
      orderBy: { foundersSlotNumber: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        foundersSlotNumber: true,
        foundersLockedPct: true,
        foundersJoinedAt: true,
        isActive: true,
        isSuspended: true,
        plan: { select: { code: true, name: true } },
      },
    }),
    db.organization.findMany({
      where: {
        isFoundersMember: false,
        isActive: true,
        isSuspended: false,
        plan: { code: { not: "FREE" } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        plan: { select: { code: true, name: true } },
      },
    }),
  ])

  const remaining = Math.max(0, state.totalSlots - state.takenSlots)
  const filledPct = state.totalSlots > 0 ? Math.round((state.takenSlots / state.totalSlots) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Founding Program
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Управление программой Founding Pricing — пожизненная скидка для первых клиентов.
        </p>
      </div>

      {/* Состояние программы */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Заполнено</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {state.takenSlots}<span className="text-slate-400 dark:text-slate-500"> / {state.totalSlots}</span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Осталось {remaining} слотов
              {state.endsAt && ` · до ${new Date(state.endsAt).toLocaleDateString("ru-RU")}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Скидка lifetime</p>
            <p className="text-3xl font-bold text-amber-500">−{state.discountPct}%</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Статус: {state.isActive ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">активна</span>
              ) : (
                <span className="text-red-600 dark:text-red-400 font-medium">выключена</span>
              )}
            </p>
          </div>
        </div>
        <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-5">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all"
            style={{ width: `${filledPct}%` }}
          />
        </div>
        <FoundersStateForm
          isActive={state.isActive}
          totalSlots={state.totalSlots}
          discountPct={state.discountPct}
        />
      </div>

      {/* Участники */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Участники программы ({members.length})</h2>
        </div>
        {members.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            Пока никто не присоединился. Слоты резервируются автоматически при создании платной подписки.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">#</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Организация</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Тариф</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Скидка</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Присоединился</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Статус</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-2.5 font-mono text-xs text-amber-600 dark:text-amber-400 font-semibold">
                    #{m.foundersSlotNumber ?? "?"}
                  </td>
                  <td className="px-5 py-2.5">
                    <Link href={`/superadmin/orgs/${m.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-purple-600 dark:hover:text-purple-400">
                      {m.name}
                    </Link>
                    <div>
                      <a
                        href={`https://${m.slug}.${ROOT_HOST}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-blue-600 font-mono inline-flex items-center gap-0.5"
                      >
                        {m.slug}.{ROOT_HOST} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-slate-600 dark:text-slate-400">{m.plan?.name ?? "—"}</td>
                  <td className="px-5 py-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400">−{m.foundersLockedPct ?? 0}%</td>
                  <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                    {m.foundersJoinedAt ? new Date(m.foundersJoinedAt).toLocaleDateString("ru-RU") : "—"}
                  </td>
                  <td className="px-5 py-2.5">
                    {m.isSuspended ? (
                      <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">приостановлен</span>
                    ) : m.isActive ? (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">активен</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">неактивен</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <ReleaseSlotButton orgId={m.id} orgName={m.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Ручное добавление */}
      {remaining > 0 && state.isActive && eligibleOrgs.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Выдать статус вручную</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 ml-2">
              Последние 20 платных организаций без статуса Founding Member.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Организация</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Тариф</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Создана</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {eligibleOrgs.map((o) => (
                <tr key={o.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-2.5">
                    <Link href={`/superadmin/orgs/${o.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-purple-600 dark:hover:text-purple-400">
                      {o.name}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-slate-600 dark:text-slate-400">{o.plan?.name ?? "—"}</td>
                  <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                    {new Date(o.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <GrantSlotButton orgId={o.id} orgName={o.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
