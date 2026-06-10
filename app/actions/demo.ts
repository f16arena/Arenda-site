"use server"

import { signIn } from "@/auth"
import { ensureDemoOrg, DEMO_EMAIL, demoPassword } from "@/lib/demo"

/**
 * Вход в публичное демо: гарантирует наличие демо-организации с данными и
 * логинит посетителя владельцем демо-БЦ. Кнопка «Попробовать демо» (/demo).
 */
export async function enterDemo(): Promise<void> {
  await ensureDemoOrg()
  await signIn("credentials", {
    login: DEMO_EMAIL,
    password: demoPassword(),
    redirectTo: "/admin",
  })
}
