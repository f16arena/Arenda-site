"use server"

import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"

export async function login(prevState: { error?: string } | undefined, formData: FormData) {
  const loginValue = String(formData.get("login") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!loginValue || !password) {
    return { error: "Введите телефон/email и пароль" }
  }

  const user = await db.user.findFirst({
    where: {
      OR: [{ phone: loginValue }, { email: loginValue }],
      isActive: true,
    },
    select: { role: true },
  })

  if (!user) {
    return { error: "Пользователь не найден или доступ запрещён" }
  }

  try {
    await signIn("credentials", {
      login: loginValue,
      password,
      redirect: false,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Неверный телефон/email или пароль" }
    }
    return { error: "Ошибка входа. Попробуйте снова" }
  }

  redirect(user.role === "TENANT" ? "/cabinet" : "/admin")
}

export async function logout() {
  await signOut({ redirectTo: "/login" })
}
