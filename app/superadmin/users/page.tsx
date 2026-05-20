export const dynamic = "force-dynamic"

import Link from "next/link"
import { Building2, Mail, Phone, Search, ShieldCheck, UserCog } from "lucide-react"
import type { Prisma } from "@/app/generated/prisma/client"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { normalizePage, pageSkip } from "@/lib/pagination"
import { safeServerValue } from "@/lib/server-fallback"
import { formatDate } from "@/lib/utils"
import { ResetOwnerPasswordButton } from "./owner-actions"

const PAGE_SIZE = 30

export default async function SuperadminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[]; q?: string | string[] }>
}) {
  const { userId } = await requirePlatformOwner()
  const resolved = await searchParams
  const page = normalizePage(resolved?.page)
  const query = normalizeQuery(resolved?.q)
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/superadmin/users", userId })

  // Только владельцы организаций. Платформенные админы (isPlatformOwner) исключены.
  const where: Prisma.UserWhereInput = {
    role: "OWNER",
    isPlatformOwner: false,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
            { organization: { name: { contains: query, mode: "insensitive" } } },
            { organization: { slug: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  }

  const [owners, total] = await Promise.all([
    safe(
      "superadmin.users.owners",
      db.user.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        skip: pageSkip(page, PAGE_SIZE),
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
          organization: {
            select: { name: true, slug: true, isActive: true, isSuspended: true, plan: { select: { name: true } } },
          },
        },
      }),
      [],
    ),
    safe("superadmin.users.total", db.user.count({ where }), 0),
  ])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-500/10">
            <UserCog className="h-5 w-5 text-purple-600 dark:text-purple-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Владельцы</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Аккаунты владельцев бизнеса по всем организациям. Здесь можно сбросить пароль владельцу — он сменит его при первом входе.
            </p>
          </div>
        </div>

        <form action="/superadmin/users" className="flex w-full gap-2 lg:w-[420px]">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Имя, email, телефон, организация…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-purple-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <button className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
            Найти
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {owners.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <UserCog className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Владельцы не найдены</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Владельцы создаются вместе с организацией. <Link href="/superadmin/orgs/new" className="text-purple-600 hover:underline dark:text-purple-400">Создать организацию</Link>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Владелец</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Контакты</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Организация</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Статус</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Создан</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Действия</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((owner) => (
                  <tr
                    key={owner.id}
                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800/70 ${owner.isActive ? "" : "opacity-60"}`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{owner.name[0]?.toUpperCase()}</span>
                        </div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{owner.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                        {owner.email && (
                          <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-slate-400" />{owner.email}</p>
                        )}
                        {owner.phone && (
                          <p className="flex items-center gap-1.5 font-mono"><Phone className="h-3 w-3 text-slate-400" />{owner.phone}</p>
                        )}
                        {!owner.email && !owner.phone && <span className="text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {owner.organization ? (
                        <div className="text-xs">
                          <p className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-200">
                            <Building2 className="h-3 w-3 text-slate-400" />{owner.organization.name}
                          </p>
                          <p className="mt-0.5 font-mono text-slate-400 dark:text-slate-500">
                            {owner.organization.slug}
                            {owner.organization.plan?.name ? ` · ${owner.organization.plan.name}` : ""}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">— без организации</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {owner.isActive ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Активен</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Неактивен</span>
                        )}
                        {owner.mustChangePassword && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Сменит пароль</span>
                        )}
                        {owner.organization?.isSuspended && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">Орг. приостановлена</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{formatDate(owner.createdAt)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end">
                        <ResetOwnerPasswordButton userId={owner.id} ownerName={owner.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PaginationControls basePath="/superadmin/users" params={{ q: query }} page={page} pageSize={PAGE_SIZE} total={total} />
      </div>

      <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5" />
        Сотрудников и арендаторов сбрасывает владелец у себя в разделе «Пользователи». Здесь — только владельцы.
      </p>
    </div>
  )
}

function normalizeQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  return (raw ?? "").trim().slice(0, 120)
}
