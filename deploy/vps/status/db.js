// Раздел «База данных» — как Table Editor, SQL Editor и Advisors в Supabase. Только чтение:
// сервер ходит в Postgres ролью status_ro, у которой нет прав на запись (см. server.py).
// Помощники ($, esc, ago, dt, mb, look, av, plural, safeGet/safeSet, getJSON, nowS) — из index.html и views.js.

const Db = {
  list: null, db: safeGet("db:id") || "commrent", tab: safeGet("db:tab") || "tables",
  tables: null, sel: null, sub: "data", q: "", showSys: false,
  page: 0, size: 50, order: "", dir: "asc", filters: [], rows: null,
  async show() {
    if (!this.list) {
      $("#db-dbs").innerHTML = '<div class="loading">Подключаюсь к базам…</div>'
      try { this.list = await getJSON("api/db/list") } catch (e) { $("#db-dbs").innerHTML = `<div class="loading">${esc(e.message)}</div>`; return }
    }
    this.renderDbs(); this.renderTabs(); this.open()
  },
  renderDbs() {
    $("#db-dbs").innerHTML = this.list.map((d) => `<button class="dbc ${d.id === this.db ? "on" : ""}" data-db="${d.id}">
      ${av({ id: d.project })}<span><b>${esc(d.name)}</b><small>${d.ok ? `${mb(d.size)} · PG ${esc(String(d.version).split(" ")[0])} · ${d.connections} подкл.` : "нет связи"}</small></span></button>`).join("")
  },
  renderTabs() { document.querySelectorAll("#db-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === this.tab)) },
  setDb(id) { this.db = id; safeSet("db:id", id); this.tables = null; this.sel = null; this.rows = null; this.renderDbs(); this.open() },
  setTab(t) { this.tab = t; safeSet("db:tab", t); this.renderTabs(); this.open() },
  open() {
    for (const t of ["tables", "sql", "advisor", "activity"]) $("#db-" + t).hidden = t !== this.tab
    clearInterval(this.actTimer)
    if (this.tab === "tables") this.loadTables()
    if (this.tab === "sql") Sql.show()
    if (this.tab === "advisor") Advisor.load()
    if (this.tab === "activity") { Activity.load(); this.actTimer = setInterval(() => !$("#v-db").hidden && this.tab === "activity" && Activity.load(), 5000) }
  },

  // ── таблицы ──
  async loadTables() {
    if (!this.tables) {
      $("#db-tlist").innerHTML = '<div class="loading">Загрузка…</div>'
      try { this.tables = (await getJSON("api/db/tables?db=" + this.db)).tables } catch (e) { $("#db-tlist").innerHTML = `<div class="loading">${esc(e.message)}</div>`; return }
      if (!this.sel) { const first = this.tables.find((t) => !t.system && t.kind === "r"); if (first) this.sel = first }
    }
    this.renderTList()
    if (this.sel) this.loadRows(); else $("#db-main").innerHTML = '<div class="loading">Выберите таблицу слева</div>'
  },
  renderTList() {
    const q = this.q.toLowerCase()
    const by = {}
    for (const t of this.tables) if ((this.showSys || !t.system) && (!q || t.name.toLowerCase().includes(q))) (by[t.schema] ||= []).push(t)
    const order = Object.keys(by).sort((a, b) => (a === "public" ? -1 : b === "public" ? 1 : a.localeCompare(b)))
    const sysN = this.tables.filter((t) => t.system).length
    $("#db-tlist").innerHTML = order.map((s) => `<h4>${esc(s)}<span>${by[s].length}</span></h4>` + by[s].map((t) => {
      const on = this.sel && this.sel.schema === t.schema && this.sel.name === t.name
      return `<button class="tb ${on ? "on" : ""}" data-s="${esc(t.schema)}" data-t="${esc(t.name)}" title="${esc(t.schema)}.${esc(t.name)}">
        <span class="ti">${t.kind === "v" || t.kind === "m" ? "◇" : "▦"}</span><span class="tn">${esc(t.name)}</span><span class="tc num">${fmtN(t.rows_est)}</span></button>`
    }).join("")).join("") + (sysN ? `<button class="sysbtn" id="db-sys">${this.showSys ? "Скрыть" : "Показать"} служебные схемы (${sysN})</button>` : "")
  },
  async loadRows() {
    const t = this.sel, main = $("#db-main")
    if (!main.querySelector(".gridwrap")) main.innerHTML = '<div class="loading">Загрузка…</div>'
    if (this.sub === "structure") return this.loadStructure()
    const u = `api/db/rows?db=${this.db}&schema=${encodeURIComponent(t.schema)}&table=${encodeURIComponent(t.name)}&limit=${this.size}&offset=${this.page * this.size}&order=${encodeURIComponent(this.order)}&dir=${this.dir}&f=${encodeURIComponent(JSON.stringify(this.filters))}`
    let d
    try { d = await getJSON(u) } catch (e) { main.innerHTML = this.head() + `<div class="dberr">${esc(e.message)}</div>`; return }
    this.rows = d
    const from = d.total ? this.page * this.size + 1 : 0, to = Math.min(d.total, (this.page + 1) * this.size)
    main.innerHTML = this.head(d) + this.filterBar(d.columns) + `<div class="gridwrap"><table class="grid"><thead><tr>
        ${d.columns.map((c) => `<th data-col="${esc(c.name)}" class="${this.order === c.name ? "sorted" : ""}"><div>${c.pk ? '<span class="pk" title="первичный ключ">🔑</span>' : ""}${esc(c.name)}${this.order === c.name ? (this.dir === "desc" ? " ↓" : " ↑") : ""}</div><small>${esc(c.type)}</small></th>`).join("")}
      </tr></thead><tbody>${d.rows.map((r, i) => `<tr>${d.columns.map((c) => cell(r[c.name], i, c.name)).join("")}</tr>`).join("") || `<tr><td colspan="${d.columns.length}" class="empty">Строк нет</td></tr>`}</tbody></table></div>
      <div class="pager"><span>${from}–${to} из ${fmtN(d.total)}${d.exact ? "" : " (примерно)"} · ${d.ms} мс</span>
        <select id="db-size">${[25, 50, 100, 250, 500].map((n) => `<option ${n === this.size ? "selected" : ""}>${n}</option>`).join("")}</select>
        <button class="btn2" id="db-prev" ${this.page ? "" : "disabled"}>←</button><button class="btn2" id="db-next" ${to < d.total ? "" : "disabled"}>→</button>
        <button class="btn2" id="db-csv">CSV</button></div>`
  },
  head(d) {
    const t = this.sel
    return `<div class="dbh"><div><div class="crumb">${esc(t.schema)} / <b>${esc(t.name)}</b>${t.rls ? ' <span class="pill2 ok">RLS</span>' : ""}${t.kind === "v" ? ' <span class="pill2">view</span>' : ""}</div>
      <div class="mut" style="font-size:12px">${fmtN(d ? d.total : t.rows_est)} строк · ${mb(t.size)}</div></div>
      <div class="seg" id="db-sub"><button data-s="data" class="${this.sub === "data" ? "on" : ""}">Данные</button><button data-s="structure" class="${this.sub === "structure" ? "on" : ""}">Структура</button></div>
      <button class="btn2" id="db-tosql" title="Открыть в SQL-редакторе">SQL ↗</button><button class="btn2" id="db-reload">↻</button></div>`
  },
  filterBar(cols) {
    const ops = [["like", "содержит"], ["eq", "="], ["neq", "≠"], ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["null", "пусто"], ["notnull", "не пусто"]]
    return `<div class="fbar">${this.filters.map((f, i) => `<span class="fchip">${esc(f.col)} ${esc(ops.find((o) => o[0] === f.op)?.[1] || f.op)} ${f.op.endsWith("null") ? "" : `«${esc(f.val)}»`}<button data-rmf="${i}">✕</button></span>`).join("")}
      <select id="f-col">${cols.map((c) => `<option>${esc(c.name)}</option>`).join("")}</select>
      <select id="f-op">${ops.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
      <input class="inp" id="f-val" placeholder="значение" style="width:180px"><button class="btn2" id="f-add">+ Фильтр</button></div>`
  },
  async loadStructure() {
    const t = this.sel, main = $("#db-main")
    let d
    try { d = await getJSON(`api/db/structure?db=${this.db}&schema=${encodeURIComponent(t.schema)}&table=${encodeURIComponent(t.name)}`) } catch (e) { main.innerHTML = this.head() + `<div class="dberr">${esc(e.message)}</div>`; return }
    const i = d.info || {}
    const CT = { p: "PRIMARY KEY", f: "FOREIGN KEY", u: "UNIQUE", c: "CHECK", x: "EXCLUDE" }
    main.innerHTML = this.head() + `<div class="kpis" style="margin-top:12px">${[["Строк", fmtN(i.rows_est)], ["Размер с индексами", mb(i.size || 0)], ["Чтений целиком / по индексу", `${fmtN(i.seq_scan)} / ${fmtN(i.idx_scan)}`], ["Мёртвых строк", fmtN(i.n_dead_tup)]].map(([k, v]) => `<div class="card kpi"><div class="k">${k}</div><div class="v num" style="font-size:18px">${v}</div></div>`).join("")}</div>
      ${sect("Колонки", d.columns.length, `<table class="tbl"><thead><tr><th>Колонка</th><th>Тип</th><th>Пусто?</th><th>По умолчанию</th><th>Комментарий</th></tr></thead><tbody>${d.columns.map((c) => `<tr><td class="mono">${esc(c.name)}</td><td class="mono mut">${esc(c.type)}</td><td>${c.nullable ? "да" : "<b>нет</b>"}</td><td class="mono mut">${esc(c.default || "")}</td><td class="mut">${esc(c.comment || "")}</td></tr>`).join("")}</tbody></table>`)}
      ${sect("Ограничения", d.constraints.length, `<table class="tbl"><tbody>${d.constraints.map((c) => `<tr><td class="mono">${esc(c.name)}</td><td><span class="pill2">${CT[c.type] || c.type}</span></td><td class="mono mut">${esc(c.def)}</td></tr>`).join("")}</tbody></table>`)}
      ${sect("Индексы", d.indexes.length, `<table class="tbl"><tbody>${d.indexes.map((x) => `<tr><td class="mono">${esc(x.name)}</td><td class="mono mut">${esc(x.def)}</td><td class="num">${mb(x.size)}</td><td class="num ${x.scans ? "" : "warnc"}">${fmtN(x.scans)} обращ.</td></tr>`).join("")}</tbody></table>`)}
      ${sect("Политики RLS", d.policies.length, d.policies.length ? `<table class="tbl"><tbody>${d.policies.map((p) => `<tr><td class="mono">${esc(p.name)}</td><td><span class="pill2">${esc(p.cmd)}</span></td><td class="mono mut">${esc(p.roles)}</td><td class="mono mut">${esc(p.qual || "")}${p.with_check ? "<br>check: " + esc(p.with_check) : ""}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">${i.rls ? "RLS включён, политик нет — обычные роли не видят ни одной строки" : "RLS выключен"}</div>`)}
      ${sect("Триггеры", d.triggers.length, `<table class="tbl"><tbody>${d.triggers.map((x) => `<tr><td class="mono">${esc(x.name)}</td><td class="mono mut">${esc(x.def)}</td></tr>`).join("")}</tbody></table>`)}`
  },
}
const fmtN = (n) => (n == null ? "—" : Number(n).toLocaleString("ru-RU"))
const sect = (title, n, body) => `<div class="card dsec"><div class="dsh">${title} <span class="mut">${n}</span></div>${n ? `<div class="scroll">${body}</div>` : body.includes("empty") ? body : '<div class="empty">нет</div>'}</div>`
function cellText(v) { return v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : String(v) }
function cell(v, i, col) {
  const t = cellText(v)
  if (t === null) return '<td class="nul">NULL</td>'
  const cls = typeof v === "number" ? "num" : typeof v === "boolean" ? "bool" : typeof v === "object" ? "json" : ""
  return `<td class="${cls}" data-r="${i}" data-c="${esc(col)}">${esc(t.length > 160 ? t.slice(0, 160) + "…" : t)}</td>`
}

// просмотр значения ячейки
function showValue(title, v) {
  const t = cellText(v)
  let pretty = t
  if (typeof v === "object" && v !== null) pretty = JSON.stringify(v, null, 2)
  else if (t && /^[[{]/.test(t)) { try { pretty = JSON.stringify(JSON.parse(t), null, 2) } catch {} }
  $("#cellv-t").textContent = title; $("#cellv-pre").textContent = pretty ?? "NULL"; $("#cellv").classList.add("on")
  $("#cellv-copy").onclick = () => { navigator.clipboard?.writeText(pretty ?? ""); $("#cellv-copy").textContent = "Скопировано"; setTimeout(() => ($("#cellv-copy").textContent = "Копировать"), 1200) }
}
$("#cellv").onclick = (e) => { if (e.target.id === "cellv" || e.target.id === "cellv-x") $("#cellv").classList.remove("on") }

$("#db-dbs").onclick = (e) => { const b = e.target.closest("[data-db]"); if (b) Db.setDb(b.dataset.db) }
$("#db-tabs").onclick = (e) => { const b = e.target.closest("button"); if (b) Db.setTab(b.dataset.t) }
$("#db-tq").oninput = (e) => { Db.q = e.target.value; Db.tables && Db.renderTList() }
$("#db-tlist").onclick = (e) => {
  if (e.target.id === "db-sys") { Db.showSys = !Db.showSys; return Db.renderTList() }
  const b = e.target.closest(".tb"); if (!b) return
  Db.sel = Db.tables.find((t) => t.schema === b.dataset.s && t.name === b.dataset.t)
  Db.page = 0; Db.order = ""; Db.filters = []; Db.sub = "data"; $("#db-main").innerHTML = ""
  Db.renderTList(); Db.loadRows()
}
$("#db-main").onclick = (e) => {
  const th = e.target.closest("th[data-col]")
  if (th) { const c = th.dataset.col; if (Db.order !== c) { Db.order = c; Db.dir = "asc" } else if (Db.dir === "asc") Db.dir = "desc"; else Db.order = ""; Db.page = 0; return Db.loadRows() }
  const td = e.target.closest("td[data-c]")
  if (td && Db.rows) return showValue(`${Db.sel.name}.${td.dataset.c}`, Db.rows.rows[td.dataset.r][td.dataset.c])
  const s = e.target.closest("#db-sub button"); if (s) { Db.sub = s.dataset.s; $("#db-main").innerHTML = ""; return Db.loadRows() }
  if (e.target.id === "db-prev") { Db.page--; return Db.loadRows() }
  if (e.target.id === "db-next") { Db.page++; return Db.loadRows() }
  if (e.target.id === "db-reload") return Db.loadRows()
  if (e.target.id === "db-tosql") { Sql.set(`select *\nfrom ${qid(Db.sel.schema)}.${qid(Db.sel.name)}\nlimit 100;`); return Db.setTab("sql") }
  if (e.target.id === "f-add") {
    const op = $("#f-op").value
    Db.filters.push({ col: $("#f-col").value, op, val: $("#f-val").value }); Db.page = 0; return Db.loadRows()
  }
  const rm = e.target.closest("[data-rmf]"); if (rm) { Db.filters.splice(Number(rm.dataset.rmf), 1); Db.page = 0; return Db.loadRows() }
  if (e.target.id === "db-csv" && Db.rows) download(`${Db.sel.name}.csv`, toCSV(Db.rows.columns.map((c) => c.name), Db.rows.rows.map((r) => Db.rows.columns.map((c) => cellText(r[c.name])))))
}
$("#db-main").onchange = (e) => { if (e.target.id === "db-size") { Db.size = Number(e.target.value); Db.page = 0; Db.loadRows() } }
$("#db-main").onkeydown = (e) => { if (e.target.id === "f-val" && e.key === "Enter") $("#f-add").click() }
const qid = (n) => (/^[a-z_][a-z0-9_]*$/.test(n) ? n : '"' + n.replace(/"/g, '""') + '"')
function toCSV(head, rows) { const q = (v) => (v == null ? "" : /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v); return "﻿" + [head, ...rows].map((r) => r.map(q).join(",")).join("\n") }
function download(name, text) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }

// ── SQL-редактор ──
const Sql = {
  hist: JSON.parse(safeGet("sql:hist") || "[]"),
  show() { const ta = $("#sql-ta"); if (!ta.value) ta.value = safeGet("sql:last:" + Db.db) || "select now();"; this.renderHist(); ta.focus() },
  set(text) { $("#sql-ta").value = text },
  renderHist() {
    $("#sql-hist").innerHTML = this.hist.length ? this.hist.slice(0, 30).map((h, i) => `<button data-h="${i}" title="${esc(h.sql)}"><span class="mut">${esc(h.db)} · ${dt(h.t)}</span>${esc(h.sql.replace(/\s+/g, " ").slice(0, 90))}</button>`).join("") : '<div class="empty">История пуста</div>'
  },
  async run() {
    const sql = $("#sql-ta").value
    if (!sql.trim()) return
    safeSet("sql:last:" + Db.db, sql)
    this.hist = [{ sql, db: Db.db, t: nowS() }, ...this.hist.filter((h) => h.sql !== sql)].slice(0, 50); safeSet("sql:hist", JSON.stringify(this.hist)); this.renderHist()
    $("#sql-run").disabled = true; $("#sql-out").innerHTML = '<div class="loading">Выполняю…</div>'
    try {
      const r = await fetch("api/db/sql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ db: Db.db, sql }) })
      if (r.status === 401) return location.replace("/login")
      const d = await r.json()
      if (!r.ok) { $("#sql-out").innerHTML = `<div class="dberr">${esc(d.error || "Ошибка")}${/read-only|permission denied/i.test(d.error || "") ? '<div class="mut" style="margin-top:6px">Панель подключена только на чтение — изменять данные отсюда нельзя.</div>' : ""}</div>`; return }
      this.last = d
      $("#sql-out").innerHTML = `<div class="pager" style="justify-content:flex-start"><span>${d.message || `${fmtN(d.rows.length)} ${plural(d.rows.length, "строка", "строки", "строк")}${d.truncated ? " (показаны первые 1000)" : ""}`} · ${d.ms} мс</span>${d.rows.length ? '<button class="btn2" id="sql-csv">CSV</button>' : ""}</div>` +
        (d.columns.length ? `<div class="gridwrap"><table class="grid"><thead><tr>${d.columns.map((c) => `<th><div>${esc(c)}</div></th>`).join("")}</tr></thead><tbody>${d.rows.map((r, i) => `<tr>${r.map((v, j) => (v === null ? '<td class="nul">NULL</td>' : `<td data-sr="${i}" data-sc="${j}">${esc(v.length > 160 ? v.slice(0, 160) + "…" : v)}</td>`)).join("")}</tr>`).join("")}</tbody></table></div>` : "")
    } catch (e) { $("#sql-out").innerHTML = `<div class="dberr">${esc(e.message)}</div>` }
    finally { $("#sql-run").disabled = false }
  },
}
$("#sql-run").onclick = () => Sql.run()
$("#sql-ta").onkeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); Sql.run() }
  if (e.key === "Tab") { e.preventDefault(); const t = e.target, s = t.selectionStart; t.value = t.value.slice(0, s) + "  " + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = s + 2 }
}
$("#sql-hist").onclick = (e) => { const b = e.target.closest("[data-h]"); if (b) Sql.set(Sql.hist[b.dataset.h].sql) }
$("#sql-out").onclick = (e) => {
  if (e.target.id === "sql-csv") return download("query.csv", toCSV(Sql.last.columns, Sql.last.rows))
  const td = e.target.closest("td[data-sr]"); if (td) showValue(Sql.last.columns[td.dataset.sc], Sql.last.rows[td.dataset.sr][td.dataset.sc])
}
document.querySelectorAll("#sql-snips button").forEach((b) => (b.onclick = () => Sql.set(SNIPS[b.dataset.k])))
const SNIPS = {
  big: "-- самые большие таблицы\nselect schemaname, relname, n_live_tup as rows,\n       pg_size_pretty(pg_total_relation_size(relid)) as size\nfrom pg_stat_user_tables\norder by pg_total_relation_size(relid) desc\nlimit 20;",
  conn: "-- кто подключён\nselect usename, application_name, client_addr, state, now() - query_start as dur, left(query, 120)\nfrom pg_stat_activity\nwhere datname = current_database()\norder by query_start;",
  idx: "-- индексы по обращениям\nselect relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) as size\nfrom pg_stat_user_indexes\norder by idx_scan;",
  ext: "-- установленные расширения\nselect extname, extversion from pg_extension order by 1;",
}

// ── Оптимизация (советник) ──
const Advisor = {
  async load() {
    $("#adv-out").innerHTML = '<div class="loading">Анализирую базу…</div>'
    let d
    try { d = await getJSON("api/db/advisor?db=" + Db.db) } catch (e) { $("#adv-out").innerHTML = `<div class="dberr">${esc(e.message)}</div>`; return }
    const s = d.stats, warn = d.findings.filter((f) => f.level === "warn").length
    const KIND = { fk_no_index: "Внешние ключи без индекса", seq_scan: "Чтение таблиц целиком", unused_index: "Неиспользуемые индексы", dead_tuples: "Мёртвые строки", dup_index: "Одинаковые индексы", no_pk: "Без первичного ключа", cache: "Кэш", conn: "Подключения" }
    const groups = {}
    for (const f of d.findings) (groups[f.kind] ||= []).push(f)
    const pctCol = (v, good = 99) => (v == null ? "" : v >= good ? "var(--ok)" : v >= 95 ? "var(--warn)" : "var(--bad)")
    $("#adv-out").innerHTML = `<div class="kpis">${[
      ["Попадание в кэш", s.cache_hit != null ? s.cache_hit + "%" : "—", pctCol(s.cache_hit)],
      ["Индексы в кэше", s.index_hit != null ? s.index_hit + "%" : "—", pctCol(s.index_hit)],
      ["Подключения", `${s.connections ?? "—"} / ${s.max_connections ?? "—"}`, ""],
      ["Размер базы", mb(s.size || 0), ""],
    ].map(([k, v, c]) => `<div class="card kpi"><div class="k">${k}</div><div class="v num" style="color:${c || "inherit"}">${v}</div></div>`).join("")}</div>
    <div class="advsum ${warn ? "w" : "ok"}">${warn ? `Найдено ${warn} ${plural(warn, "проблема", "проблемы", "проблем")}, которые стоит исправить, и ${d.findings.length - warn} на заметку.` : d.findings.length ? `Серьёзного нет, ${d.findings.length} на заметку.` : "Всё хорошо — советнику не к чему придраться."}
      <span class="mut">Панель ничего не меняет сама: SQL ниже выполняется вручную. <code>concurrently</code> не блокирует таблицу.</span></div>
    ${Object.entries(groups).map(([k, list]) => `<div class="card dsec"><div class="dsh">${KIND[k] || k} <span class="mut">${list.length}</span></div>${list.map((f) => `<details class="fnd"><summary><span class="lv ${f.level}">${f.level === "warn" ? "исправить" : "заметка"}</span>${esc(f.title)}</summary>
      <p>${esc(f.detail)}</p>${f.sql ? `<div class="sqlb"><pre>${esc(f.sql)}</pre><button class="btn2" data-copy="${esc(f.sql)}">Копировать</button></div>` : ""}</details>`).join("")}</div>`).join("")}
    <div class="card dsec"><div class="dsh">Самые тяжёлые запросы <span class="mut">по суммарному времени</span></div>${d.top === null
      ? '<div class="empty" style="text-align:left">В этой базе не подключено расширение pg_stat_statements — без него Postgres не считает время запросов. Включается добавлением <code>pg_stat_statements</code> в <code>shared_preload_libraries</code> и перезапуском базы.</div>'
      : d.top.length ? `<div class="scroll"><table class="tbl"><thead><tr><th class="r">Вызовов</th><th class="r">Всего</th><th class="r">Среднее</th><th class="r">Макс</th><th class="r">Кэш</th><th>Запрос</th></tr></thead><tbody>${d.top.map((q) => `<tr><td class="r num">${fmtN(q.calls)}</td><td class="r num">${fmtMs(q.total_ms)}</td><td class="r num ${q.mean_ms > 100 ? "warnc" : ""}">${fmtMs(q.mean_ms)}</td><td class="r num">${fmtMs(q.max_ms)}</td><td class="r num">${q.hit ?? "—"}%</td><td><details class="qd"><summary class="mono">${esc(q.query.replace(/\s+/g, " ").slice(0, 110))}</summary><pre>${esc(q.query)}</pre><button class="btn2" data-explain="${esc(q.query)}">EXPLAIN в SQL-редакторе</button></details></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Статистика ещё не накопилась</div>'}</div>`
  },
}
const fmtMs = (v) => (v == null ? "—" : v >= 60000 ? (v / 60000).toFixed(1) + " мин" : v >= 1000 ? (v / 1000).toFixed(1) + " с" : Math.round(v) + " мс")
$("#adv-out").onclick = (e) => {
  const c = e.target.closest("[data-copy]")
  if (c) { navigator.clipboard?.writeText(c.dataset.copy); c.textContent = "Скопировано"; setTimeout(() => (c.textContent = "Копировать"), 1200) }
  const x = e.target.closest("[data-explain]")
  if (x) { Sql.set("explain\n" + x.dataset.explain.replace(/\$\d+/g, "null")); Db.setTab("sql") }
}
$("#adv-refresh").onclick = () => Advisor.load()

// ── Активность ──
const Activity = {
  async load() {
    let d
    try { d = await getJSON("api/db/activity?db=" + Db.db) } catch (e) { $("#act-out").innerHTML = `<div class="dberr">${esc(e.message)}</div>`; return }
    const active = d.activity.filter((a) => a.state === "active").length
    $("#act-out").innerHTML = `<div class="pager" style="justify-content:flex-start"><span>${d.activity.length} ${plural(d.activity.length, "подключение", "подключения", "подключений")}, активных ${active}${d.locks.length ? ` · <b style="color:var(--bad)">ждут блокировку: ${d.locks.length}</b>` : ""} · обновляется каждые 5 с</span></div>
      <div class="card"><div class="scroll"><table class="tbl"><thead><tr><th>PID</th><th>Пользователь</th><th>Приложение</th><th>Состояние</th><th class="r">Длится</th><th>Запрос</th></tr></thead><tbody>${d.activity.map((a) => `<tr><td class="num mut">${a.pid}</td><td class="mono">${esc(a.user || "")}</td><td class="mut">${esc(a.app || "")}</td><td><span class="pill2 ${a.state === "active" ? "ok" : a.state === "idle in transaction" ? "bad" : ""}">${esc(a.state || "—")}</span>${a.wait ? ` <span class="mut">${esc(a.wait)}</span>` : ""}</td><td class="r num ${a.state === "active" && a.secs > 5 ? "warnc" : ""}">${a.secs == null ? "" : fmtMs(a.secs * 1000)}</td><td class="mono mut" style="max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(a.query || "")}">${esc(a.query || "")}</td></tr>`).join("")}</tbody></table></div></div>`
  },
}
