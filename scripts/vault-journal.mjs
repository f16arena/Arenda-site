#!/usr/bin/env node
/**
 * Автозапись итогов работы Claude Code в Obsidian-vault.
 *
 * Вызывается хуком Stop (см. .claude/settings.json). На вход через stdin
 * приходит JSON вида { session_id, transcript_path, cwd, ... }.
 *
 * Что делает:
 *   1. читает транскрипт сессии (JSONL),
 *   2. берёт последний ответ ассистента + список изменённых файлов,
 *   3. дописывает раздел в дневную заметку vault'а:
 *      <vault>/Commrent/Журнал/YYYY-MM-DD.md
 *
 * Формат заметок повторяет уже сложившийся в vault (папки Orda, TSHELL):
 * заголовок-дата, строка «Записано автоматически» со ссылкой на заметку
 * проекта, дальше разделы «## ЧЧ:ММ · итог». Только дописывает в конец —
 * ручные правки в заметке не трогает.
 *
 * Дедупликация — по uuid последнего записанного сообщения (состояние в
 * .claude/journal-state.json), поэтому повторный Stop в той же сессии
 * не плодит дубли.
 *
 * Скрипт намеренно «тихий»: любая ошибка гасится и не ломает сессию.
 */

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

// Корень Obsidian-vault. Можно переопределить переменной OBSIDIAN_VAULT.
const VAULT = process.env.OBSIDIAN_VAULT || "C:\\Users\\Арыстан\\Documents\\Obsidian Vault"
// Папка проекта внутри vault (рядом с Orda, TSHELL, Tender Helper).
const PROJECT = "Commrent"

// Турны короче этого (без правок файлов) не записываем — это реплики
// вроде «готово» или уточняющие вопросы, в журнале от них только шум.
const MIN_SUMMARY_CHARS = 120
// Ограничение на объём одной записи, чтобы заметка не разрасталась.
const MAX_SUMMARY_CHARS = 6000

function main() {
  const raw = fs.readFileSync(0, "utf8")
  if (!raw.trim()) return

  const input = JSON.parse(raw)
  const cwd = input.cwd || process.cwd()
  const transcriptPath = input.transcript_path
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return
  if (!fs.existsSync(VAULT)) return // vault не смонтирован — молча выходим

  const entries = readTranscript(transcriptPath)
  if (entries.length === 0) return

  const last = lastAssistantText(entries)
  if (!last) return

  const stateFile = path.join(cwd, ".claude", "journal-state.json")
  const state = readJson(stateFile) ?? {}
  const sessionId = input.session_id || "unknown"
  if (state[sessionId] === last.uuid) return // уже записано

  const files = editedFiles(entries, cwd)
  const summary = redact(last.text).slice(0, MAX_SUMMARY_CHARS)
  if (files.length === 0 && summary.length < MIN_SUMMARY_CHARS) return

  const now = new Date()
  const day = localDate(now)
  const projectDir = path.join(VAULT, PROJECT)
  const notePath = path.join(projectDir, "Журнал", `${day}.md`)
  fs.mkdirSync(path.dirname(notePath), { recursive: true })
  ensureHubNote(projectDir)

  if (!fs.existsSync(notePath)) {
    fs.writeFileSync(notePath, dailyHeader(day), "utf8")
  }
  fs.appendFileSync(notePath, sessionSection({ now, cwd, summary, files }), "utf8")

  state[sessionId] = last.uuid
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8")

  process.stdout.write(
    JSON.stringify({
      suppressOutput: true,
      systemMessage: `Записано в vault: ${PROJECT}/Журнал/${day}.md`,
    }),
  )
}

/** YYYY-MM-DD в местной зоне (не UTC — иначе вечерние сессии уезжают на день вперёд). */
function localDate(d) {
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return null
  }
}

/** Разбирает JSONL-транскрипт, молча пропуская битые строки. */
function readTranscript(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

/** Текст последнего содержательного ответа ассистента + его uuid. */
function lastAssistantText(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e?.type !== "assistant") continue
    const text = collectText(e?.message?.content)
    if (text.trim()) return { text: text.trim(), uuid: e.uuid ?? String(i) }
  }
  return null
}

function collectText(content) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
}

/** Файлы, которые правились в этой сессии (по вызовам Edit/Write/NotebookEdit). */
function editedFiles(entries, cwd) {
  const seen = new Set()
  for (const e of entries) {
    if (e?.type !== "assistant") continue
    const content = e?.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block?.type !== "tool_use") continue
      if (!["Edit", "Write", "NotebookEdit"].includes(block.name)) continue
      const p = block?.input?.file_path
      if (typeof p !== "string") continue
      seen.add(path.relative(cwd, p).split(path.sep).join("/"))
    }
  }
  return [...seen].filter((p) => p && !p.startsWith("..")).sort()
}

/**
 * Затирает то, что похоже на секреты: заметки лежат в общем vault и
 * синхронизируются, паролям и токенам там не место.
 */
function redact(text) {
  return text
    .replace(/\b(eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})\b/g, "«токен вырезан»")
    .replace(/\b(sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g, "«ключ вырезан»")
    .replace(
      /((?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*)(\S+)/gi,
      "$1«вырезано»",
    )
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, "$1«вырезано»$2")
}

function gitInfo(cwd) {
  const run = (args) => {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
    } catch {
      return ""
    }
  }
  return { branch: run(["rev-parse", "--abbrev-ref", "HEAD"]), sha: run(["rev-parse", "--short=8", "HEAD"]) }
}

/** Заметка-хаб проекта, чтобы ссылка [[Commrent]] из журнала вела куда надо. */
function ensureHubNote(projectDir) {
  const hub = path.join(projectDir, `${PROJECT}.md`)
  if (fs.existsSync(hub)) return
  fs.writeFileSync(
    hub,
    `# ${PROJECT}

SaaS для управления коммерческой недвижимостью: здания, помещения, арендаторы,
договоры, счета, ЭЦП и ЭСФ. Прод — https://commrent.kz, репозиторий —
\`C:\\Users\\Арыстан\\Desktop\\site arenda\\arenda-pro\`, документация — в \`docs/\` там же.

Эта папка ведётся автоматически: итог каждого ответа Claude падает в [[Журнал]] сам.
Руками сюда можно дописывать что угодно — автозапись только добавляет в конец
дневной заметки и ничего не перезаписывает.

## Где что

- \`Журнал/\` — по заметке на день: что было сделано и какие файлы менялись
- \`Решения/\` — почему сделано именно так; на них ссылаются заметки журнала
`,
    "utf8",
  )
}

function dailyHeader(day) {
  return `# ${day}\n\nЗаписано автоматически. [[${PROJECT}]]\n`
}

function sessionSection({ now, cwd, summary, files }) {
  const { branch, sha } = gitInfo(cwd)
  const time = now.toTimeString().slice(0, 5)
  const meta = [branch && `ветка \`${branch}\``, sha && `коммит \`${sha}\``]
    .filter(Boolean)
    .join(" · ")

  const fileList = files.length
    ? `\nФайлов изменено: ${files.length}\n${files.map((f) => `- \`${f}\``).join("\n")}\n`
    : ""

  return `\n## ${time} · итог\n${meta ? `\n${meta}\n` : ""}${fileList}\n${summary}\n`
}

try {
  main()
} catch {
  // Журнал не должен ронять сессию — молча выходим.
}
