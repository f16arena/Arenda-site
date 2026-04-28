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
            await action(fd)
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
