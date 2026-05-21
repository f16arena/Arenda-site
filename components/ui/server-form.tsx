"use client"

import { useTransition, ReactNode, FormHTMLAttributes } from "react"
import { toast } from "sonner"

interface ServerFormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "action"> {
  action: (formData: FormData) => Promise<unknown>
  successMessage?: string
  children: ReactNode
}

export function ServerForm({ action, successMessage = "Сохранено", children, ...props }: ServerFormProps) {
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
              toast.error("Не удалось сохранить")
              return
            }
            toast.success(successMessage)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Ошибка")
          }
        })
      }
    >
      {children}
    </form>
  )
}
