import { Fragment, type ReactNode } from "react"

/**
 * Строка словаря с выделением и подстановками — как React-узлы, а не как HTML.
 *
 * Зачем не dangerouslySetInnerHTML: в такие строки подставляются данные из базы
 * (название организации, email), а их вводят пользователи. Название вида
 * «<img onerror=…>» через innerHTML стало бы исполняемой разметкой. Здесь
 * значения попадают в дерево React отдельными узлами, и он их экранирует сам.
 *
 * Понимает только <b>…</b> — этого хватает для баннеров, а разбирать полный
 * HTML в переводах незачем: разметка в тексте усложняет перевод.
 */

const TOKEN = /(<b>|<\/b>|\{\w+\})/g

export function RichText({
  template,
  vars,
}: {
  template: string
  vars?: Record<string, ReactNode>
}) {
  const parts = template.split(TOKEN).filter((piece) => piece !== "")
  const out: ReactNode[] = []
  // Незакрытый <b> не ломает вывод: текст просто останется невыделенным.
  let bold: ReactNode[] | null = null

  const push = (node: ReactNode) => {
    if (bold) bold.push(node)
    else out.push(node)
  }

  for (const piece of parts) {
    if (piece === "<b>") {
      bold = []
      continue
    }
    if (piece === "</b>") {
      if (bold) {
        out.push(<b key={out.length}>{bold.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</b>)
        bold = null
      }
      continue
    }
    const name = piece.startsWith("{") && piece.endsWith("}") ? piece.slice(1, -1) : null
    if (name && vars && name in vars) {
      push(vars[name])
      continue
    }
    push(piece)
  }
  // Осиротевший <b> без закрытия — отдаём накопленное как обычный текст.
  if (bold) out.push(...bold)

  return (
    <>
      {out.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </>
  )
}
