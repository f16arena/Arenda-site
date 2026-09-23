"use client"

import { useTransition, ReactNode, FormHTMLAttributes } from "react"
import { toast } from "sonner"
import { useT } from "@/lib/i18n/client"

interface ServerFormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "action"> {
  action: (formData: FormData) => Promise<unknown>
  successMessage?: string
  children: ReactNode
}

export function ServerForm({ action, successMessage, children, ...props }: ServerFormProps) {
  const { t } = useT()
  const [, startTransition] = useTransition()

  return (
    <form
      {...props}
      action={(fd) =>
        startTransition(async () => {
          try {
            const result = await action(fd)
            // Server actions, которые возвращают { success: false, error } вместо
            // throw: в проде Next затирает текст брошенных ошибок, а возвращённые
            // значения отдаёт как есть. Поэтому реальную причину показываем отсюда.
            if (result && typeof result === "object" && "error" in result && (result as { error?: unknown }).error) {
              toast.error(String((result as { error: unknown }).error))
              return
            }
            if (result && typeof result === "object" && (result as { success?: unknown }).success === false) {
              toast.error(t("common.state.saveFailed"))
              return
            }
            toast.success(successMessage ?? t("common.state.saved"))
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t("common.state.error"))
          }
        })
      }
    >
      {children}
    </form>
  )
}
