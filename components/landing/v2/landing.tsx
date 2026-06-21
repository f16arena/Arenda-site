"use client"

import { useEffect, useRef } from "react"
import { LANDING_BODY_AFTER, LANDING_BODY_BEFORE, LANDING_CSS } from "./landing-data"
import { PricingDesignSection } from "./pricing-design-section"
import type { PricingPlan, PricingPeriod, PricingMatrix } from "@/components/landing/pricing-data"

/**
 * Главная страница (новый дизайн). Вёрстка/CSS из дизайна вставляются как есть
 * (через <style> + dangerouslySetInnerHTML) — стиль живёт только пока смонтирована
 * страница (на других маршрутах не протекает). JS-эффекты (scroll-reveal, шапка,
 * калькулятор потерь, scroll-spy, параллакс героя) перенесены в useEffect с очисткой.
 * Ссылки кнопок ведут на реальные маршруты (/login, /signup, /demo).
 */
export function LandingV2({
  pricing,
  founding,
  editorImageUrl,
  dashboardUrl,
}: {
  pricing: { plans: PricingPlan[]; periods: PricingPeriod[]; matrix: PricingMatrix } | null
  founding: { remaining: number; total: number; isActive: boolean } | null
  editorImageUrl?: string | null
  dashboardUrl?: string | null
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  // Для залогиненного пользователя CTA входа/регистрации (Войти/Начать/Попробовать)
  // ведут прямо в его рабочую зону (dashboardUrl), а не на /login — без петель.
  // /demo НЕ подменяем: демонстрация — отдельная песочница, доступна всем (в т.ч.
  // залогиненным), иначе кнопка «Демо» у владельца уводила бы в его же дашборд.
  const withCta = (html: string) =>
    dashboardUrl
      ? html
          .replaceAll('href="/login"', `href="${dashboardUrl}"`)
          .replaceAll('href="/signup"', `href="${dashboardUrl}"`)
      : html
  // Подстановка реального скриншота 3D-редактора (из БД) вместо плейсхолдера.
  const before = withCta(
    editorImageUrl
      ? LANDING_BODY_BEFORE.replace(
          '<div class="img-ph">Скриншот 3D-редактора здания</div>',
          `<img src="${editorImageUrl}" alt="3D-редактор здания Commrent" style="width:100%;height:clamp(320px,38vw,420px);object-fit:cover;display:block" />`,
        )
      : LANDING_BODY_BEFORE,
  )
  const after = withCta(LANDING_BODY_AFTER)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const html = document.documentElement
    const cleanups: Array<() => void> = []
    const timers: ReturnType<typeof setTimeout>[] = []
    const q = <T extends Element = Element>(sel: string) => Array.from(root.querySelectorAll<T>(sel))

    // — шапка: граница при скролле —
    const head = root.querySelector("#head")
    const onScrollHead = () => head?.classList.toggle("scrolled", window.scrollY > 10)
    onScrollHead()
    window.addEventListener("scroll", onScrollHead, { passive: true })
    cleanups.push(() => window.removeEventListener("scroll", onScrollHead))

    // — scroll-reveal —
    const reveals = q(".reveal") as HTMLElement[]
    html.classList.add("anim")
    cleanups.push(() => html.classList.remove("anim"))
    q(".grid, .roles, .plans, .faq, .segs").forEach((g) => {
      let i = 0
      Array.from(g.children).forEach((c) => {
        if (c.classList.contains("reveal")) { (c as HTMLElement).style.transitionDelay = `${i * 55}ms`; i++ }
      })
    })
    const inView = (el: Element) => { const r = el.getBoundingClientRect(); return r.top < innerHeight * 0.92 && r.bottom > 0 }
    let io: IntersectionObserver | null = null
    const arm = (el: HTMLElement) => {
      if (el.dataset.armed) return
      el.dataset.armed = "1"
      el.classList.add("in")
      if (io) io.unobserve(el)
      timers.push(setTimeout(() => {
        el.getAnimations?.().forEach((a) => { try { a.cancel() } catch {} })
        el.style.opacity = "1"; el.style.transform = "none"; el.style.filter = "none"
      }, 1500))
    }
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) arm(e.target as HTMLElement) }), { threshold: 0.1, rootMargin: "0px 0px -7% 0px" })
      reveals.forEach((el) => io!.observe(el))
      cleanups.push(() => io?.disconnect())
    }
    const revealVisible = () => reveals.forEach((el) => { if (!el.dataset.armed && inView(el)) arm(el) })
    let rafFired = false
    requestAnimationFrame(() => { rafFired = true; revealVisible() })
    const onLoad = () => revealVisible()
    window.addEventListener("load", onLoad)
    cleanups.push(() => window.removeEventListener("load", onLoad))
    let srt = 0
    const onScrollReveal = () => { if (srt) return; srt = requestAnimationFrame(() => { revealVisible(); srt = 0 }) }
    window.addEventListener("scroll", onScrollReveal, { passive: true })
    cleanups.push(() => window.removeEventListener("scroll", onScrollReveal))
    timers.push(setTimeout(revealVisible, 300))
    timers.push(setTimeout(() => {
      if (rafFired) return
      html.classList.remove("anim")
      reveals.forEach((el) => { el.style.opacity = "1"; el.style.transform = "none"; el.style.filter = "none" })
    }, 1700))

    // — калькулятор потерь —
    const area = root.querySelector<HTMLInputElement>("#c-area")
    const rate = root.querySelector<HTMLInputElement>("#c-rate")
    const over = root.querySelector<HTMLInputElement>("#c-over")
    if (area && rate && over) {
      const f = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")
      const setText = (id: string, v: string) => { const el = root.querySelector("#" + id); if (el) el.textContent = v }
      const calc = () => {
        const A = +area.value, R = +rate.value, O = +over.value / 100
        const monthly = A * R, overdue = monthly * O, tenants = Math.max(1, Math.round(A / 110))
        const penalty = overdue * 0.004 * 18 * 12, labor = tenants * 5200 * 12, cash = overdue * 0.18, total = penalty + labor + cash
        setText("cv-area", f(A) + " м²"); setText("cv-rate", f(R) + " ₸/м²"); setText("cv-over", O * 100 + "%")
        setText("c-pen", f(penalty) + " ₸"); setText("c-lab", f(labor) + " ₸"); setText("c-cash", f(cash) + " ₸"); setText("c-total", f(total))
      }
      ;[area, rate, over].forEach((el) => el.addEventListener("input", calc))
      cleanups.push(() => [area, rate, over].forEach((el) => el.removeEventListener("input", calc)))
      calc()
    }

    // — scroll-spy —
    const links = new Map((q(".nav-links a") as HTMLAnchorElement[]).map((a) => [(a.getAttribute("href") || "").slice(1), a]))
    const targets = q("[id]").filter((s) => links.has(s.id))
    if ("IntersectionObserver" in window && targets.length) {
      const spy = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { links.forEach((a) => a.classList.remove("active")); links.get((e.target as Element).id)?.classList.add("active") }
      }), { rootMargin: "-45% 0px -50% 0px" })
      targets.forEach((t) => spy.observe(t))
      cleanups.push(() => spy.disconnect())
    }

    // — параллакс героя —
    const hv = root.querySelector<HTMLElement>(".h-visual")
    let praf = 0
    const onScrollParallax = () => { if (praf) return; praf = requestAnimationFrame(() => { if (hv && window.scrollY < 900) hv.style.transform = `translateY(${window.scrollY * -0.04}px)`; praf = 0 }) }
    window.addEventListener("scroll", onScrollParallax, { passive: true })
    cleanups.push(() => window.removeEventListener("scroll", onScrollParallax))

    return () => { cleanups.forEach((fn) => fn()); timers.forEach(clearTimeout) }
  }, [])

  return (
    <>
      {/* Дизайн фиксированно светлый — принудительно держим светлый фон даже при
          системной/сохранённой тёмной теме (стиль действует только на этой странице). */}
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS + "\nhtml body{background:#f4f6f9!important;color:#0a1020!important}" }} />
      <div ref={rootRef}>
        <div dangerouslySetInnerHTML={{ __html: before }} />
        {pricing && (
          <PricingDesignSection plans={pricing.plans} periods={pricing.periods} matrix={pricing.matrix} founding={founding} ctaHref={dashboardUrl ?? "/signup"} />
        )}
        <div dangerouslySetInnerHTML={{ __html: after }} />
      </div>
    </>
  )
}
