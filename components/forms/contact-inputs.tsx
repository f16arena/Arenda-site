"use client"

import { useState } from "react"

const EMAIL_PATTERN =
  "^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"

type BaseInputProps = {
  name: string
  defaultValue?: string | null
  required?: boolean
  className?: string
}

export function KzPhoneInput({ name, defaultValue, required, className }: BaseInputProps) {
  const [value, setValue] = useState(formatKzPhoneInput(defaultValue ?? ""))

  return (
    <input
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="tel"
      required={required}
      value={value}
      onFocus={() => {
        if (!value) setValue("+7 ")
      }}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return
        if (PHONE_CONTROL_KEYS.has(event.key)) return
        if (event.key.length === 1 && !/\d/.test(event.key)) event.preventDefault()
      }}
      onPaste={(event) => {
        event.preventDefault()
        setValue(formatKzPhoneInput(event.clipboardData.getData("text")))
      }}
      onChange={(event) => setValue(formatKzPhoneInput(event.target.value))}
      onBlur={() => {
        if (value === "+7 ") setValue("")
      }}
      placeholder="+7 700 000 00 00"
      pattern="^\+7\s[67]\d{2}\s\d{3}\s\d{2}\s\d{2}$"
      minLength={16}
      maxLength={16}
      title="Введите казахстанский номер: +7 7XX XXX XX XX или +7 6XX XXX XX XX"
      className={className}
    />
  )
}

export function AsciiEmailInput({ name, defaultValue, required, className }: BaseInputProps) {
  const [value, setValue] = useState(cleanEmail(defaultValue ?? ""))

  return (
    <input
      name={name}
      type="email"
      inputMode="email"
      autoComplete="email"
      required={required}
      value={value}
      onChange={(event) => setValue(cleanEmail(event.target.value))}
      onPaste={(event) => {
        event.preventDefault()
        setValue(cleanEmail(event.clipboardData.getData("text")))
      }}
      placeholder="tenant@example.com"
      pattern={EMAIL_PATTERN}
      maxLength={254}
      title="Введите email латиницей, обязательно с @ и доменом, например name@gmail.com"
      className={className}
    />
  )
}

const PHONE_CONTROL_KEYS = new Set([
  "Backspace",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "Tab",
  "Enter",
])

function formatKzPhoneInput(raw: string) {
  const digits = raw.replace(/\D/g, "")
  let national = digits

  if (national.startsWith("8")) national = national.slice(1)
  if (national.startsWith("7")) national = national.slice(1)

  national = national.slice(0, 10)
  if (national && !/^[67]/.test(national)) national = ""

  if (!national) return raw.trim() ? "+7 " : ""

  const parts = [
    national.slice(0, 3),
    national.slice(3, 6),
    national.slice(6, 8),
    national.slice(8, 10),
  ].filter(Boolean)

  return `+7 ${parts.join(" ")}`
}

function cleanEmail(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9.!#$%&'*+/=?^_`{|}~@-]/g, "")
}
