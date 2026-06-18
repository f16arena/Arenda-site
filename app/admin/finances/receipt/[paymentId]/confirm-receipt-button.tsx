"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, Loader2 } from "lucide-react"
import { confirmCashReceipt } from "@/app/actions/finance"

export function ConfirmReceiptButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmCashReceipt(paymentId)
      if (result.ok) {
        toast.success("Квитанция подтверждена")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleConfirm}
      disabled={pending}
      className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      Подтвердить приём наличных
    </button>
  )
}
