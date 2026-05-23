import { Quote, TrendingUp, Building2, Users, FileText } from "lucide-react"
import { db } from "@/lib/db"

/**
 * Соц-доказательство: цитата первого Founding-клиента + цифры платформы.
 * Цифры тянем живыми из БД, чтобы не врать ("400+ арендаторов" должно
 * быть правдой на любой момент).
 */
export async function SocialProofSection() {
  const [orgCount, buildingCount, tenantCount, docCount] = await Promise.all([
    db.organization.count({ where: { isActive: true, isSuspended: false } }).catch(() => 0),
    db.building.count({ where: { isActive: true } }).catch(() => 0),
    db.tenant.count().catch(() => 0),
    db.generatedDocument.count().catch(() => 0),
  ])

  return (
    <section id="proof" className="border-y border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <figure className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <Quote className="h-7 w-7 text-blue-600" />
            <blockquote className="mt-4 text-lg leading-7 text-slate-900">
              «У нас 28 арендаторов в БЦ. До Commrent я тратил 3-4 часа в день на счета, акты
              и WhatsApp с жалобами. Сейчас всё в одном экране — за неделю вернул себе
              два рабочих дня и вижу долги сразу, без бухгалтера. Самое полезное —
              кабинет арендатора, теперь они сами скачивают акт сверки.»
            </blockquote>
            <figcaption className="mt-5 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">Founding Member #1, БЦ в Алматы</span>
              <span className="text-slate-500"> · 28 арендаторов, ~3 200 м²</span>
            </figcaption>
          </figure>

          <div>
            <p className="text-sm font-semibold text-blue-600">Цифры платформы</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Уже работает в реальных объектах
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Платформа развёрнута на Supabase во Франкфурте, бэкапы ежедневные, доступ
              только владельца к своим данным (изоляция через subdomain).
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <StatCard icon={Building2} value={orgCount} label="организаций" />
              <StatCard icon={Building2} value={buildingCount} label="объектов" />
              <StatCard icon={Users} value={tenantCount} label="арендаторов" />
              <StatCard icon={FileText} value={docCount} label="документов сгенерировано" />
            </div>
            <p className="mt-4 inline-flex items-center gap-1 text-xs text-emerald-700">
              <TrendingUp className="h-3 w-3" />
              Цифры обновляются в реальном времени.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function StatCard({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <Icon className="h-4 w-4 text-blue-600" />
      <p className="mt-2 text-2xl font-bold text-slate-950">{value.toLocaleString("ru-RU")}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}
