import { MessageSquare } from "lucide-react"

export default function CabinetMessages() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-slate-900">Сообщения</h1>
      <div className="bg-white rounded-xl border border-slate-200 py-20 text-center">
        <MessageSquare className="h-10 w-10 text-slate-200 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-600">Чат в разработке</p>
        <p className="text-xs text-slate-400 mt-1">Будет добавлен в следующей фазе</p>
      </div>
    </div>
  )
}
