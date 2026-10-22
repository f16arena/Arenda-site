// Разделы панели поверх «Обзора»: Ошибки (как Issues), Журналы (как Logs в Vercel/Supabase), Крон, База данных.
// Общие помощники ($, esc, ago, dt, hm, look, av, plural, safeGet/safeSet) — из index.html.

const VIEWS = ["overview", "errors", "logs", "cron", "db"]
const nowS = () => Math.floor(Date.now() / 1000)
const PNAME = { commrent: "Commrent", orda: "Orda", jiyn: "Jiyn", shared: "Общие", other: "Прочее" }

function route() {
  const v = (location.hash.replace("#", "").split("?")[0]) || "overview"
  const view = VIEWS.includes(v) ? v : "overview"
  for (const id of VIEWS) $("#v-" + id).hidden = id !== view
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.v === view))
  if (view === "overview") requestAnimationFrame(() => typeof drawChart === "function" && drawChart())
  if (view === "errors") Errors.show()
  if (view === "logs") Logs.show()
  if (view === "cron") Cron.show()
  if (view === "db") Db.show()
  if (view !== "logs") Logs.stop()
  if (view !== "db") clearInterval(Db.actTimer)
  scrollTo(0, 0)
}
addEventListener("hashchange", route)

async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" })
  if (r.status === 401) { location.replace("/login"); throw new Error("401") }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || "HTTP " + r.status)
  return j
}
const hl = (text, q) => {
  const e = esc(text)
  if (!q) return e
  try { return e.replace(new RegExp("(" + q.replace(/[&<>"]/g, "") + ")", "gi"), "<mark>$1</mark>") } catch { return e }
}

function sparkSvg(vals, w = 120, h = 28, col = "var(--bad)") {
  const m = Math.max(1, ...vals), bw = w / vals.length
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${vals.map((v, i) => v ? `<rect x="${(i * bw).toFixed(1)}" y="${(h - (v / m) * h).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${((v / m) * h).toFixed(1)}" rx="1" fill="${col}" opacity=".85"/>` : "").join("")}</svg>`
}

// ── Ошибки ────────────────────────────────────────────────────────────────────
const Errors = {
  hours: Number(safeGet("err:h") || 24), project: "all", q: "", open: new Set(), data: null, loading: false,
  async show(force) {
    if (this.loading) return
    if (this.data && !force && nowS() - this.loadedAt < 30) return this.render()
    this.loading = true
    if (!this.data) $("#err-list").innerHTML = '<div class="loading">Собираю ошибки из всех журналов…</div>'
    try {
      this.data = await getJSON("api/errors?hours=" + this.hours); this.loadedAt = nowS()
    } catch (e) { $("#err-list").innerHTML = `<div class="loading">Не удалось: ${esc(e.message)}</div>` }
    this.loading = false
    this.render()
  },
  render() {
    const d = this.data; if (!d) return
    document.querySelectorAll("#err-range button").forEach((b) => b.classList.toggle("on", Number(b.dataset.h) === this.hours))
    const groups = d.groups.filter((g) => (this.project === "all" || g.project === this.project) &&
      (!this.q || (g.message + " " + g.source).toLowerCase().includes(this.q.toLowerCase())))
    const last1h = d.groups.reduce((a, g) => a + g.spark.slice(-Math.max(1, Math.round(3600 / d.bucket))).reduce((x, y) => x + y, 0), 0)
    $("#err-kpi").innerHTML = [
      ["Ошибок за период", d.total], ["Разных ошибок", d.groups.length], ["За последний час", last1h], ["Источников проверено", d.sources],
    ].map(([k, v]) => `<div class="card kpi"><div class="k">${k}</div><div class="v num">${v}</div></div>`).join("")
    // график по времени
    const W = 1000, H = 120, n = d.timeline.length, mx = Math.max(1, ...d.timeline), bw = W / n
    const lbl = []; for (let i = 0; i < n; i += Math.ceil(n / 6)) lbl.push(`<text class="axis" x="${i * bw}" y="${H - 2}">${this.hours > 24 ? dt(d.buckets[i]) : hm(d.buckets[i])}</text>`)
    $("#err-chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${d.timeline.map((v, i) => `<rect x="${i * bw + 1}" y="${(H - 16) - (v / mx) * (H - 22)}" width="${bw - 2}" height="${Math.max(v ? 2 : 0, (v / mx) * (H - 22))}" rx="2" fill="var(--bad)" opacity=".8"><title>${dt(d.buckets[i])}: ${v}</title></rect>`).join("")}<line x1="0" x2="${W}" y1="${H - 15}" y2="${H - 15}" stroke="var(--line)"/>${lbl.join("")}</svg>`
    const projs = ["all", ...new Set(d.groups.map((g) => g.project))]
    $("#err-chips").innerHTML = projs.map((p) => {
      const c = p === "all" ? d.groups.length : d.groups.filter((g) => g.project === p).length
      return `<button class="chip2 ${this.project === p ? "on" : ""}" data-p="${p}">${p === "all" ? "Все" : av({ id: p }) + esc(PNAME[p] || p)} <span class="mut">${c}</span></button>`
    }).join("")
    $("#err-list").innerHTML = groups.length ? groups.map((g, i) => {
      const id = g.sid + "|" + g.fp, open = this.open.has(id)
      return `<div class="it"><div class="ih" data-i="${i}"><span class="bar"></span>
        <div class="m"><div class="msg">${esc(g.message.split("\n")[0])}</div>
          <div class="src">${av({ id: g.project })}<span>${esc(g.source)}</span><span>· впервые ${g.first ? ago(g.first, nowS()) : "—"}</span></div></div>
        ${sparkSvg(g.spark)}<div class="n">${g.count}<small>${plural(g.count, "раз", "раза", "раз")}</small></div>
        <div class="w">${g.last ? `<span data-ago="${g.last}">${ago(g.last, nowS())}</span>` : "—"}</div></div>
        ${open ? `<div class="ib"><pre>${esc(g.message)}</pre><div class="acts">
          <button class="btn2" data-logs="${esc(g.sid)}" data-q="${esc(g.fp.replace(/<\w+>|N/g, " ").trim().split(/\s+/).filter((w) => w.length > 3).slice(0, 3).join(" ").replace(/[.*+?^${}()|[\]\\]/g, ""))}">Открыть в журналах →</button>
          <span>последний раз ${g.last ? dt(g.last) : "—"}</span></div></div>` : ""}</div>`
    }).join("") : `<div class="loading">${d.groups.length ? "Ничего не найдено по фильтру" : "Ошибок нет 🎉"}</div>`
    this.groups = groups
  },
}
$("#err-range").onclick = (e) => { const b = e.target.closest("button"); if (b) { Errors.hours = Number(b.dataset.h); safeSet("err:h", Errors.hours); Errors.data = null; Errors.show(true) } }
$("#err-chips").onclick = (e) => { const b = e.target.closest("button"); if (b) { Errors.project = b.dataset.p; Errors.render() } }
$("#err-q").oninput = (e) => { Errors.q = e.target.value; Errors.render() }
$("#err-refresh").onclick = () => Errors.show(true)
$("#err-list").onclick = (e) => {
  const lb = e.target.closest("[data-logs]")
  if (lb) { Logs.preset([lb.dataset.logs], lb.dataset.q); location.hash = "logs"; return }
  const h = e.target.closest(".ih"); if (!h) return
  const g = Errors.groups[h.dataset.i], id = g.sid + "|" + g.fp
  Errors.open.has(id) ? Errors.open.delete(id) : Errors.open.add(id); Errors.render()
}

// ── Журналы ───────────────────────────────────────────────────────────────────
const Logs = {
  sources: null, sel: new Set(JSON.parse(safeGet("logs:sel") || '["c:commrent-web-1"]')), q: "", level: "", minutes: 60,
  live: safeGet("logs:live") !== "0", timer: null, lines: [],
  preset(sids, q) { this.sel = new Set(sids); this.q = q || ""; this.level = ""; this.minutes = 1440; $("#lg-q").value = this.q; this.saveSel() },
  saveSel() { safeSet("logs:sel", JSON.stringify([...this.sel])) },
  async show() {
    if (!this.sources) {
      try { this.sources = await getJSON("api/log-sources") } catch (e) { $("#lg-src").innerHTML = esc(e.message); return }
    }
    this.renderSources(); this.renderBar(); this.load(); this.startLive()
  },
  stop() { clearInterval(this.timer); this.timer = null },
  startLive() { this.stop(); if (this.live) this.timer = setInterval(() => !$("#v-logs").hidden && this.load(), 3000) },
  renderSources() {
    const by = {}
    for (const s of this.sources) (by[s.project] ||= []).push(s)
    $("#lg-src").innerHTML = Object.entries(by).map(([p, list]) => `<h4>${av({ id: p })}${esc(PNAME[p] || p)}<button data-all="${p}">все</button></h4>` +
      list.map((s) => `<label class="${this.sel.has(s.id) ? "on" : ""}"><input type="checkbox" value="${esc(s.id)}" ${this.sel.has(s.id) ? "checked" : ""}>${esc(s.name.replace(/^(Commrent|Orda|Jiyn) · /, ""))}<span class="k">${{ container: "docker", service: "служба", file: "файл" }[s.kind]}</span></label>`).join("")).join("")
  },
  renderBar() {
    document.querySelectorAll("#lg-level button").forEach((b) => b.classList.toggle("on", b.dataset.l === this.level))
    document.querySelectorAll("#lg-range button").forEach((b) => b.classList.toggle("on", Number(b.dataset.m) === this.minutes))
    $("#lg-live").classList.toggle("on", this.live)
    $("#lg-live").innerHTML = this.live ? "● Live" : "○ Live"
  },
  async load() {
    if (!this.sel.size) { $("#lg-lines").innerHTML = '<div class="loading">Выберите источники слева</div>'; $("#lg-stat").textContent = ""; return }
    const u = `api/log-search?src=${encodeURIComponent([...this.sel].join(","))}&q=${encodeURIComponent(this.q)}&level=${this.level}&minutes=${this.minutes}&limit=2000`
    const box = $("#lg-lines"), atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 40
    let d
    try { d = await getJSON(u) } catch (e) { box.innerHTML = `<div class="loading">${esc(e.message)}</div>`; return }
    const name = (sid) => this.sources.find((s) => s.id === sid)
    $("#lg-stat").innerHTML = `<span>${d.matched} ${plural(d.matched, "строка", "строки", "строк")}${d.matched > d.lines.length ? ` · показаны последние ${d.lines.length}` : ""}</span><span>обновлено ${new Date().toLocaleTimeString("ru-RU")}</span>`
    box.innerHTML = d.lines.length ? d.lines.map((l) => {
      const s = name(l.src)
      return `<div class="ln ${l.lv}"><span class="t">${l.t ? new Date(l.t * 1000).toLocaleTimeString("ru-RU") : ""}</span><span class="s" style="color:${look(s?.project).tint}">${esc(s?.name || l.src)}</span><span class="x">${hl(l.msg, this.q)}</span></div>`
    }).join("") : '<div class="loading">Нет строк за выбранный период</div>'
    if (atEnd || !this.loadedOnce) box.scrollTop = box.scrollHeight
    this.loadedOnce = true
  },
}
$("#lg-src").onchange = (e) => {
  const v = e.target.value; e.target.checked ? Logs.sel.add(v) : Logs.sel.delete(v)
  Logs.saveSel(); Logs.renderSources(); Logs.loadedOnce = false; Logs.load()
}
$("#lg-src").onclick = (e) => {
  const b = e.target.closest("[data-all]"); if (!b) return
  const ids = Logs.sources.filter((s) => s.project === b.dataset.all).map((s) => s.id)
  const all = ids.every((i) => Logs.sel.has(i))
  ids.forEach((i) => (all ? Logs.sel.delete(i) : Logs.sel.add(i)))
  Logs.saveSel(); Logs.renderSources(); Logs.load()
}
let lgT
$("#lg-q").oninput = (e) => { clearTimeout(lgT); lgT = setTimeout(() => { Logs.q = e.target.value; Logs.load() }, 350) }
$("#lg-level").onclick = (e) => { const b = e.target.closest("button"); if (b) { Logs.level = b.dataset.l; Logs.renderBar(); Logs.load() } }
$("#lg-range").onclick = (e) => { const b = e.target.closest("button"); if (b) { Logs.minutes = Number(b.dataset.m); Logs.renderBar(); Logs.loadedOnce = false; Logs.load() } }
$("#lg-live").onclick = () => { Logs.live = !Logs.live; safeSet("logs:live", Logs.live ? "1" : "0"); Logs.renderBar(); Logs.startLive() }
$("#lg-refresh").onclick = () => Logs.load()
$("#lg-lines").onclick = (e) => { const l = e.target.closest(".ln"); if (l && !getSelection().toString()) l.classList.toggle("open") }

// ── Крон ──────────────────────────────────────────────────────────────────────
function cronField(f, lo, hi) {
  const out = new Set()
  for (const part of f.split(",")) {
    let [rng, step] = part.split("/"); step = Number(step || 1)
    let a = lo, b = hi
    if (rng !== "*") { const [x, y] = rng.split("-").map(Number); a = x; b = y ?? (part.includes("/") ? hi : x) }
    for (let i = a; i <= b; i += step) out.add(i)
  }
  return out
}
function cronNext(expr, from) {
  const [mi, ho, dom, mon, dow] = expr.trim().split(/\s+/)
  const M = cronField(mi, 0, 59), H = cronField(ho, 0, 23), D = cronField(dom, 1, 31), MO = cronField(mon, 1, 12), W = cronField(dow, 0, 7)
  if (W.has(7)) W.add(0)
  const d = new Date(Math.ceil((from * 1000 + 1) / 60000) * 60000)
  for (let i = 0; i < 60 * 24 * 370; i++) {
    const ok = MO.has(d.getUTCMonth() + 1) && H.has(d.getUTCHours()) && M.has(d.getUTCMinutes()) &&
      (dom === "*" || dow === "*" ? D.has(d.getUTCDate()) && W.has(d.getUTCDay()) : D.has(d.getUTCDate()) || W.has(d.getUTCDay()))
    if (ok) return d.getTime() / 1000
    d.setTime(d.getTime() + 60000)
  }
  return null
}
function cronHuman(expr) {
  const [mi, ho, dom, mon, dow] = expr.split(/\s+/)
  const at = () => { const t = new Date(Date.UTC(2026, 0, 1, Number(ho), Number(mi))); return t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) }
  if (expr === "* * * * *") return "каждую минуту"
  if (/^\*\/\d+$/.test(mi) && ho === "*" && dom === "*") return `каждые ${mi.slice(2)} мин`
  if (/^[\d,]+$/.test(mi) && ho === "*" && dom === "*") return mi.includes(",") ? "несколько раз в час" : `каждый час в :${mi.padStart(2, "0")}`
  if (/^\*\/\d+$/.test(ho)) return `каждые ${ho.slice(2)} ч`
  if (/^\d+$/.test(mi) && /^\d+$/.test(ho)) {
    if (dom === "*" && dow === "*") return "ежедневно в " + at()
    if (dom === "*" && /^\d$/.test(dow)) return ["по воскресеньям", "по понедельникам", "по вторникам", "по средам", "по четвергам", "по пятницам", "по субботам", "по воскресеньям"][dow] + " в " + at()
    if (/^\d+$/.test(dom)) return `${dom}-го числа в ${at()}`
    if (/^\d+-\d+$/.test(dom)) return `${dom.replace("-", "–")} числа в ${at()}`
  }
  return expr
}
const Cron = {
  async show() {
    if (!$("#cron-list").innerHTML) $("#cron-list").innerHTML = '<div class="loading">Загрузка…</div>'
    let d
    try { d = await getJSON("api/cron") } catch (e) { $("#cron-list").innerHTML = `<div class="loading">${esc(e.message)}</div>`; return }
    const now = nowS()
    const rows = d.jobs.map((j) => ({ ...j, next: cronNext(j.schedule, now) })).sort((a, b) => (a.project || "z").localeCompare(b.project || "z") || (a.next || 9e12) - (b.next || 9e12))
    $("#cron-list").innerHTML = `<div class="scroll"><table class="tbl cron"><thead><tr><th>Проект</th><th>Задача</th><th>Когда</th><th>Следующий запуск</th><th>Последний результат</th></tr></thead><tbody>${rows.map((j) => {
      const st = j.last ? (/->\s*2\d\d|\s2\d\d\s|\bok\b/i.test(j.last) ? "ok" : /->\s*[45]\d\d|\s[45]\d\d\s|ошибк|error|fail/i.test(j.last) ? "bad" : "") : ""
      return `<tr><td>${j.project ? av({ id: j.project }) : ""}</td>
        <td><div class="nm">${esc(j.name)}</div><div class="sch">${esc(j.file)} · ${esc(j.schedule)}</div></td>
        <td>${esc(cronHuman(j.schedule))}</td>
        <td class="num">${j.next ? `${dt(j.next)}<div class="sch">через <span data-in="${j.next}">${fmtIn(j.next - now)}</span></div>` : "—"}</td>
        <td>${j.last ? `<div class="last ${st}" title="${esc(j.last)}">${st === "ok" ? "✓ " : st === "bad" ? "✕ " : ""}${esc(j.last)}</div>` : '<span class="mut">журнала нет</span>'}</td></tr>`
    }).join("")}</tbody></table></div>`
  },
}
function fmtIn(s) { return s < 3600 ? Math.max(1, Math.round(s / 60)) + " мин" : s < 86400 ? Math.floor(s / 3600) + " ч " + Math.round((s % 3600) / 60) + " мин" : Math.floor(s / 86400) + " дн" }
$("#cron-refresh").onclick = () => Cron.show()

// ── База данных — в db.js ─────────────────────────────────────────────────────

// счётчик ошибок за последний час в навигации
async function errBadge() {
  try {
    const d = await getJSON("api/errors?hours=1")
    const c = $("#nav-err-cnt"); c.textContent = d.total; c.hidden = !d.total
  } catch {}
}
errBadge(); setInterval(errBadge, 60000)

// Открытые разделы обновляются сами (как в Vercel): крон — раз в 30 с, ошибки — раз в минуту
// (разбор всех журналов дорогой, сервер кэширует его на минуту), журналы — Live каждые 3 с.
setInterval(() => { if (!document.hidden && !$("#v-cron").hidden) Cron.show() }, 30000)
setInterval(() => { if (!document.hidden && !$("#v-errors").hidden) Errors.show(true) }, 60000)
// «5 мин назад» / «через 3 ч» — пересчитываются каждую секунду без запросов к серверу.
setInterval(() => {
  const n = nowS()
  document.querySelectorAll("[data-ago]").forEach((e) => (e.textContent = ago(Number(e.dataset.ago), n)))
  document.querySelectorAll("[data-in]").forEach((e) => (e.textContent = fmtIn(Math.max(0, Number(e.dataset.in) - n))))
}, 1000)
route()
