export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Shield, AlertTriangle } from "lucide-react"
import { SECTIONS, SECTION_LABELS } from "@/lib/acl"
import { PermissionsMatrix } from "./permissions-matrix"

const ROLES = [
  { key: "OWNER", label: "Владелец", color: "bg-purple-50 text-purple-700" },
  { key: "ADMIN", label: "Администратор", color: "bg-blue-50 text-blue-700" },
  { key: "ACCOUNTANT", label: "Бухгалтер", color: "bg-green-50 text-green-700" },
  { key: "FACILITY_MANAGER", label: "Завхоз", color: "bg-orange-50 text-orange-700" },
] as const

export default async function RolesPage() {
  const session = await auth()
  if (!session || !["OWNER", "ADMIN"].includes(session.user.role)) redirect("/admin")
  const isOwner = session.user.role === "OWNER"

  let rows: { role: string; section: string; canView: boolean; canEdit: boolean }[] = []
  let migrationMissing = false
  try {
    rows = await db.rolePermission.findMany({
      select: { role: true, section: true, canView: true, canEdit: true },
    })
  } catch {
    migrationMissing = true
  }

  const map: Record<string, Record<string, { canView: boolean; canEdit: boolean }>> = {}
  for (const r of rows) {
    if (!map[r.role]) map[r.role] = {}
    map[r.role][r.section] = { canView: r.canView, canEdit: r.canEdit }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
          <Shield className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Роли и доступ</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isOwner ? "Кликайте по ячейкам чтобы изменить права. OWNER всегда имеет полный доступ." : "Просмотр прав доступа (только OWNER может изменять)."}
          </p>
        </div>
      </div>

      {migrationMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 mb-1">Таблица прав не создана в базе</p>
              <p className="text-sm text-amber-800 mb-3">
                Запустите миграцию <code className="bg-amber-100 px-1.5 py-0.5 rounded">migrations/006_role_permissions.sql</code> в Supabase SQL Editor. После этого обновите страницу.
              </p>
              <details className="text-xs text-amber-700">
                <summary className="cursor-pointer hover:underline">Показать SQL для запуска</summary>
                <pre className="mt-2 bg-white border border-amber-200 rounded p-3 overflow-x-auto whitespace-pre-wrap">{MIGRATION_SQL}</pre>
              </details>
            </div>
          </div>
        </div>
      )}

      <PermissionsMatrix
        roles={ROLES.map((r) => ({ ...r }))}
        sections={SECTIONS.map((s) => ({ key: s, label: SECTION_LABELS[s] }))}
        permissions={map}
        editable={isOwner && !migrationMissing}
      />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">Как читать матрицу:</p>
        <ul className="text-xs space-y-1 list-disc list-inside">
          <li><b>👁</b> — может просматривать раздел (видит в меню и открывает страницу)</li>
          <li><b>✏️</b> — может редактировать (создавать/изменять/удалять данные)</li>
          <li>Клик по иконке переключает: серый → зелёный (видит) → синий (редактирует) → серый</li>
          <li>Изменения применяются сразу. Кеш ACL обновляется в течение 30 секунд</li>
        </ul>
      </div>
    </div>
  )
}

const MIGRATION_SQL = `CREATE TABLE IF NOT EXISTS role_permissions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  role       TEXT NOT NULL,
  section    TEXT NOT NULL,
  can_view   BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role, section)
);

DROP TRIGGER IF EXISTS role_permissions_updated_at ON role_permissions;
CREATE TRIGGER role_permissions_updated_at
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
`
