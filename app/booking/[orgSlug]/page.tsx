export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { Building2, MapPin, Phone, Mail, Calendar } from "lucide-react"
import { formatMoney } from "@/lib/utils"
import { BookingForm } from "./booking-form"

export default async function PublicBookingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params

  const org = await db.organization.findUnique({
    where: { slug: orgSlug, isActive: true, isSuspended: false },
    select: {
      id: true,
      name: true,
      buildings: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          email: true,
          totalArea: true,
          floors: {
            select: {
              id: true,
              number: true,
              name: true,
              ratePerSqm: true,
              fullFloorTenantId: true,
              spaces: {
                where: {
                  status: "VACANT",
                  kind: "RENTABLE",
                },
                select: {
                  id: true,
                  number: true,
                  area: true,
                  description: true,
                },
                orderBy: { number: "asc" },
              },
            },
            orderBy: { number: "asc" },
          },
        },
      },
    },
  })

  if (!org) notFound()

  const allVacantSpaces = org.buildings.flatMap((b) =>
    b.floors.flatMap((f) =>
      f.fullFloorTenantId ? [] :
      f.spaces.map((s) => ({
        ...s,
        floorName: f.name,
        ratePerSqm: f.ratePerSqm,
        buildingId: b.id,
        buildingName: b.name,
        buildingAddress: b.address,
      })),
    ),
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 backdrop-blur bg-white/95">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{org.name}</h1>
              <p className="text-xs text-slate-500">Свободные площади в аренду</p>
            </div>
          </div>
          <a
            href="https://commrent.kz"
            className="text-xs text-slate-400 hover:text-slate-600"
            target="_blank"
            rel="noopener"
          >
            Powered by Commrent
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {allVacantSpaces.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Building2 className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Свободных помещений нет</h2>
            <p className="text-sm text-slate-500 mb-4">
              Сейчас все помещения заняты. Оставьте заявку — мы свяжемся когда что-то освободится.
            </p>
            {org.buildings[0] && (
              <BookingForm
                orgSlug={orgSlug}
                buildings={org.buildings.map((b) => ({ id: b.id, name: b.name }))}
              />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Список */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-1">
                  {allVacantSpaces.length} свободн{allVacantSpaces.length === 1 ? "ое помещение" : allVacantSpaces.length < 5 ? "ых помещения" : "ых помещений"}
                </h2>
                <p className="text-sm text-slate-500">
                  Выберите подходящее и оставьте заявку — мы свяжемся в течение часа.
                </p>
              </div>

              {org.buildings.map((b) => {
                const buildingSpaces = b.floors
                  .filter((f) => !f.fullFloorTenantId)
                  .flatMap((f) =>
                    f.spaces.map((s) => ({
                      ...s,
                      floorName: f.name,
                      ratePerSqm: f.ratePerSqm,
                    })),
                  )
                if (buildingSpaces.length === 0) return null
                return (
                  <div key={b.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                      <h3 className="text-base font-semibold text-slate-900">{b.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {b.address}
                      </p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {buildingSpaces.map((s) => (
                        <div key={s.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/50">
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              Кабинет {s.number} <span className="text-slate-400 font-normal">· {s.floorName}</span>
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {s.area} м² · {formatMoney(s.area * s.ratePerSqm)}/мес
                              {s.description ? ` · ${s.description}` : ""}
                            </p>
                          </div>
                          <a
                            href={`#booking-form`}
                            className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                          >
                            Записаться →
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Sidebar — форма */}
            <aside className="space-y-4">
              <div id="booking-form" className="bg-white rounded-2xl border border-slate-200 p-5 sticky top-24">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-slate-900">Записаться на просмотр</h3>
                </div>
                <BookingForm
                  orgSlug={orgSlug}
                  buildings={org.buildings.map((b) => ({ id: b.id, name: b.name }))}
                />
              </div>

              {/* Контакты */}
              {(org.buildings[0]?.phone || org.buildings[0]?.email) && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">Связаться напрямую</h3>
                  <div className="space-y-2 text-sm">
                    {org.buildings[0]?.phone && (
                      <a href={`tel:${org.buildings[0].phone}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                        <Phone className="h-3.5 w-3.5" />
                        {org.buildings[0].phone}
                      </a>
                    )}
                    {org.buildings[0]?.email && (
                      <a href={`mailto:${org.buildings[0].email}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                        <Mail className="h-3.5 w-3.5" />
                        {org.buildings[0].email}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 mt-12 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center text-xs text-slate-400">
          Платформа управления коммерческой арендой · <a href="https://commrent.kz" className="hover:underline" target="_blank">commrent.kz</a>
        </div>
      </footer>
    </div>
  )
}
