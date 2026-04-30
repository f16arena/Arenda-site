"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  ArrowDown, ArrowUp, ArrowRightLeft, Settings, Plus, X,
  Banknote, Wallet, CreditCard,
} from "lucide-react"
import { formatMoney } from "@/lib/utils"
import {
  createCashAccount, depositToAccount, withdrawFromAccount,
  transferBetweenAccounts, adjustAccountBalance,
} from "@/app/actions/cash-accounts"

interface Transaction {
  id: string
  amount: number
  type: string
  description: string | null
  date: string
}

interface Account {
  id: string
  name: string
  type: string
  balance: number
  currency: string
  notes: string | null
  recentTransactions: Transaction[]
}

const TYPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  BANK: { label: "Банк", icon: Banknote },
  CASH: { label: "Наличка", icon: Wallet },
  CARD: { label: "Карта", icon: CreditCard },
}

const TX_TYPE_META: Record<string, { label: string; color: string }> = {
  DEPOSIT: { label: "Пополнение", color: "text-emerald-600 dark:text-emerald-400" },
  WITHDRAW: { label: "Списание", color: "text-red-600 dark:text-red-400" },
  ADJUSTMENT: { label: "Корректировка", color: "text-amber-600 dark:text-amber-400" },
  TRANSFER_IN: { label: "Перевод (вход)", color: "text-blue-600 dark:text-blue-400" },
  TRANSFER_OUT: { label: "Перевод (исход)", color: "text-purple-600 dark:text-purple-400" },
}

type DialogMode =
  | { kind: "deposit"; accountId: string; accountName: string }
  | { kind: "withdraw"; accountId: string; accountName: string }
  | { kind: "adjust"; accountId: string; accountName: string; current: number }
  | { kind: "transfer" }
  | { kind: "create" }
  | null

export function BalanceClient({ accounts }: { accounts: Account[] }) {
  const [dialog, setDialog] = useState<DialogMode>(null)
  const [pending, startTransition] = useTransition()

  function close() { setDialog(null) }

  return (
    <div className="space-y-5">
      {/* Кнопки сверху */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setDialog({ kind: "transfer" })}
          disabled={accounts.length < 2}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 disabled:opacity-50"
        >
          <ArrowRightLeft className="h-4 w-4" />
          Перевод между счетами
        </button>
        <button
          onClick={() => setDialog({ kind: "create" })}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          Добавить счёт
        </button>
      </div>

      {/* Карточки счетов */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {accounts.map((acc) => {
          const TypeIcon = TYPE_META[acc.type]?.icon ?? Wallet
          return (
            <div
              key={acc.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <TypeIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{acc.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {TYPE_META[acc.type]?.label ?? acc.type}
                      {acc.notes && ` · ${acc.notes}`}
                    </p>
                  </div>
                </div>
                <p className={`text-xl font-bold ${acc.balance < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>
                  {formatMoney(acc.balance)}
                </p>
              </div>

              <div className="p-3 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <button
                  onClick={() => setDialog({ kind: "deposit", accountId: acc.id, accountName: acc.name })}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-1.5 text-xs font-medium"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  Внести
                </button>
                <button
                  onClick={() => setDialog({ kind: "withdraw", accountId: acc.id, accountName: acc.name })}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-700 dark:text-red-300 px-2 py-1.5 text-xs font-medium"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  Списать
                </button>
                <button
                  onClick={() => setDialog({ kind: "adjust", accountId: acc.id, accountName: acc.name, current: acc.balance })}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 px-2 py-1.5 text-xs"
                  title="Корректировка баланса"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Recent transactions */}
              <div className="max-h-64 overflow-y-auto">
                {acc.recentTransactions.length === 0 ? (
                  <p className="px-5 py-6 text-xs text-slate-400 dark:text-slate-500 text-center">
                    Транзакций пока нет
                  </p>
                ) : (
                  acc.recentTransactions.map((t) => {
                    const meta = TX_TYPE_META[t.type] ?? { label: t.type, color: "text-slate-600" }
                    return (
                      <div
                        key={t.id}
                        className="px-5 py-2.5 border-b border-slate-50 dark:border-slate-800 last:border-b-0 flex items-center justify-between"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                            {t.description ?? meta.label}
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            {meta.label} · {new Date(t.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <p className={`text-sm font-semibold ${t.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {t.amount > 0 ? "+" : ""}{formatMoney(t.amount)}
                        </p>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}

        {accounts.length === 0 && (
          <div className="md:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
            <Wallet className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">У вас пока нет счетов</p>
            <button
              onClick={() => setDialog({ kind: "create" })}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              Создать счёт
            </button>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {dialog?.kind === "deposit" && (
        <Dialog title={`Внести деньги · ${dialog.accountName}`} onClose={close}>
          <form
            action={(fd) => startTransition(async () => {
              fd.set("accountId", dialog.accountId)
              const r = await depositToAccount(fd)
              if (r.ok) { toast.success("Зачислено"); close() }
              else toast.error(r.error ?? "Ошибка")
            })}
            className="space-y-4"
          >
            <Field label="Сумма (₸)" name="amount" type="number" step="0.01" required min="0.01" />
            <Field label="Описание (необязательно)" name="description" placeholder="Например: внесение наличных, поступление от арендатора" />
            <SubmitBtn label="Зачислить" pending={pending} />
          </form>
        </Dialog>
      )}

      {dialog?.kind === "withdraw" && (
        <Dialog title={`Списать · ${dialog.accountName}`} onClose={close}>
          <form
            action={(fd) => startTransition(async () => {
              fd.set("accountId", dialog.accountId)
              const r = await withdrawFromAccount(fd)
              if (r.ok) { toast.success("Списано"); close() }
              else toast.error(r.error ?? "Ошибка")
            })}
            className="space-y-4"
          >
            <Field label="Сумма (₸)" name="amount" type="number" step="0.01" required min="0.01" />
            <Field label="Описание (необязательно)" name="description" placeholder="Например: оплата коммуналки, выдача зп" />
            <SubmitBtn label="Списать" pending={pending} />
          </form>
        </Dialog>
      )}

      {dialog?.kind === "adjust" && (
        <Dialog title={`Корректировка · ${dialog.accountName}`} onClose={close}>
          <form
            action={(fd) => startTransition(async () => {
              fd.set("accountId", dialog.accountId)
              const r = await adjustAccountBalance(fd)
              if (r.ok) { toast.success("Баланс обновлён"); close() }
              else toast.error(r.error ?? "Ошибка")
            })}
            className="space-y-4"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Текущий баланс: <span className="font-semibold">{formatMoney(dialog.current)}</span>.
              Введите фактическую сумму — разница будет записана как корректировка.
            </p>
            <Field label="Новый баланс (₸)" name="newBalance" type="number" step="0.01" defaultValue={String(dialog.current)} />
            <Field label="Причина корректировки" name="description" placeholder="Например: пересчёт кассы" />
            <SubmitBtn label="Применить" pending={pending} />
          </form>
        </Dialog>
      )}

      {dialog?.kind === "transfer" && (
        <Dialog title="Перевод между счетами" onClose={close}>
          <form
            action={(fd) => startTransition(async () => {
              const r = await transferBetweenAccounts(fd)
              if (r.ok) { toast.success("Перевод выполнен"); close() }
              else toast.error(r.error ?? "Ошибка")
            })}
            className="space-y-4"
          >
            <Select label="Откуда" name="fromId" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {formatMoney(a.balance)}</option>
              ))}
            </Select>
            <Select label="Куда" name="toId" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {formatMoney(a.balance)}</option>
              ))}
            </Select>
            <Field label="Сумма (₸)" name="amount" type="number" step="0.01" required min="0.01" />
            <Field label="Описание (необязательно)" name="description" placeholder="Например: инкассация" />
            <SubmitBtn label="Перевести" pending={pending} />
          </form>
        </Dialog>
      )}

      {dialog?.kind === "create" && (
        <Dialog title="Новый счёт" onClose={close}>
          <form
            action={(fd) => startTransition(async () => {
              const r = await createCashAccount(fd)
              if (r.ok) { toast.success("Счёт создан"); close() }
              else toast.error(r.error ?? "Ошибка")
            })}
            className="space-y-4"
          >
            <Field label="Название" name="name" required placeholder="Например: Каспи Бизнес, Halyk Расчётный" />
            <Select label="Тип" name="type" defaultValue="BANK">
              <option value="BANK">Банковский счёт</option>
              <option value="CASH">Наличка / касса</option>
              <option value="CARD">Карта</option>
            </Select>
            <Field label="Начальный баланс (₸)" name="balance" type="number" step="0.01" defaultValue="0" />
            <Field label="Заметка (необязательно)" name="notes" placeholder="Например: основной счёт для аренды" />
            <SubmitBtn label="Создать" pending={pending} />
          </form>
        </Dialog>
      )}
    </div>
  )
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Field({
  label, name, type = "text", step, required, defaultValue, placeholder, min,
}: {
  label: string
  name: string
  type?: string
  step?: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
  min?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
      />
    </div>
  )
}

function Select({
  label, name, defaultValue, required, children,
}: {
  label: string
  name: string
  defaultValue?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
      >
        {children}
      </select>
    </div>
  )
}

function SubmitBtn({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "..." : label}
    </button>
  )
}
