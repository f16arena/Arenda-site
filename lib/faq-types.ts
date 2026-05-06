export type FaqAudience = "owner" | "admin" | "tenant"

export type FaqItem = {
  id: string
  audience: FaqAudience
  category: string
  question: string
  answer: string
  steps?: string[]
  tags: string[]
  href?: string
  hrefLabel?: string
}

export const faqAudienceLabels: Record<FaqAudience, string> = {
  owner: "Владелец",
  admin: "Администратор",
  tenant: "Арендатор",
}
