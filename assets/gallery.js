const STATUS = {
  stable: { label: "稳定", cls: "ok" },
  wip: { label: "进行中", cls: "wip" },
  broken: { label: "不可用", cls: "bad" },
};

const PREVIEW_W = 1280;
const PREVIEW_H = 800;
const MAX_LIVE = 3;

const els = {
  sub: document.getElementById("sub"),
  count: document.getElementById("count"),
  q: document.getElementById("q"),
  sort: document.getElementById("sort"),
  statusFilter: document.getElementById("statusFilter"),
  tags: document.getElementById("tags"),
  grid: document.getElementById("grid"),
  empty: document.getElementById("empty"),
  reset: document.getElementById("reset"),
  random: document.getElementById("random"),
  generated: document.getElementById("generated"),
  detail: document.getElementById("detail"),
  dTitle: document.getElementById("d-title"),
  dSummary: document.getElementById("d-summary"),
  dMeta: document.getElementById("d-meta"),
  dPrompt: document.getElementById("d-prompt"),
  dNotes: document.getElementById("d-notes"),
  dNotesBlock: document.getElementById("d-notes-block"),
  dFiles: document.getElementById("d-files"),
  dOpen: document.getElementById("d-open"),
  dFrame: document.getElementById("d-frame"),
  dCopy: document.getElementById("d-copy"),
  dClose: document.getElementById("d-close"),
  dReload: document.getElementById("d-reload"),
  stage: document.getElementById("stage"),
};

const state = { q: "", tags: new Set(), status: "all", sort: "newest" };
let demos = [];
const bySlug = new Map();
const live = [];
const unmountTimers = new Map();
let current = null;

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const hash = (str) => {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
};

/* ---------------- state <-> url ---------------- */

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.q = p.get("q") ?? "";
  state.status = p.get("status") ?? "all";
  state.sort = p.get("sort") ?? "newest";
  state.tags = new Set((p.get("tags") ?? "").split(",").filter(Boolean));
  if (!["all", "stable", "wip", "broken"].includes(state.status)) state.status = "all";
  if (!["newest", "oldest", "title"].includes(state.sort)) state.sort = "newest";
}

function writeHash() {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (state.tags.size) p.set("tags", [...state.tags].join(","));
  if (state.status !== "all") p.set("status", state.status);
  if (state.sort !== "newest") p.set("sort", state.sort);
  const next = p.toString();
  history.replaceState(null, "", next ? `#${next}` : location.pathname + location.search);
}

/* ---------------- data ---------------- */

async function init() {
  readHash();
  try {
    const res = await fetch("demos/manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    demos = Array.isArray(data.demos) ? data.demos : [];
    els.generated.textContent = data.generatedAt
      ? `清单生成于 ${new Date(data.generatedAt).toLocaleString()}`
      : "";
  } catch (err) {
    els.grid.innerHTML = `<div class="notice">读取 demos/manifest.json 失败：${esc(err.message)}<br>运行 <code>node tools/scan-demos.mjs</code> 生成清单，并用本地 HTTP 服务打开本页（file:// 下 fetch 会被拦截）。</div>`;
    return;
  }

  for (const d of demos) bySlug.set(d.slug, d);
  els.sub.textContent = `${demos.length} 个 agent demo`;
  els.q.value = state.q;
  els.sort.value = state.sort;
  syncStatusButtons();
  renderTags();
  render();
}

/* ---------------- filtering ---------------- */

function matches(d) {
  if (state.status !== "all" && d.status !== state.status) return false;
  for (const tag of state.tags) if (!d.tags.includes(tag)) return false;

  const q = state.q.trim().toLowerCase();
  if (!q) return true;
  const haystack = [d.title, d.summary, d.agent, d.prompt, d.notes, ...d.tags].join(" ").toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

function visibleDemos() {
  const list = demos.filter(matches);
  const byDate = (a, b) => (a.createdAt === b.createdAt ? a.title.localeCompare(b.title) : a.createdAt < b.createdAt ? 1 : -1);
  if (state.sort === "oldest") list.sort((a, b) => -byDate(a, b));
  else if (state.sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));
  else list.sort(byDate);
  return list;
}

/* ---------------- rendering ---------------- */

function syncStatusButtons() {
  for (const btn of els.statusFilter.querySelectorAll("button")) {
    btn.classList.toggle("on", btn.dataset.status === state.status);
  }
  els.sort.value = state.sort;
}

function renderTags() {
  const counts = new Map();
  for (const d of demos) for (const t of d.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tags = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  els.tags.innerHTML = tags
    .map(([tag, n]) => `<button type="button" class="tag${state.tags.has(tag) ? " on" : ""}" data-tag="${esc(tag)}">${esc(tag)}<span class="n">${n}</span></button>`)
    .join("");
}

function cardHTML(d) {
  const st = STATUS[d.status] ?? STATUS.stable;
  const hue = hash(d.slug) % 360;
  const monogram = (d.title.match(/[A-Za-z0-9]/g) ?? ["?"]).slice(0, 2).join("");
  const poster = d.poster
    ? `<img class="shot" src="${esc("demos/" + d.slug + "/" + d.poster)}" alt="" loading="lazy" decoding="async">`
    : "";
  const ph = `<div class="ph" style="background: radial-gradient(130% 130% at 18% 0%, hsl(${hue} 55% 20%), #0a0c10 62%)"><span>${esc(monogram)}</span></div>`;
  const tags = d.tags.slice(0, 3).map((t) => `<span class="pill">${esc(t)}</span>`).join("");
  const agent = d.agent ? String(d.agent).split("/").pop().trim() : "";

  return `<article class="card" data-slug="${esc(d.slug)}" tabindex="0" role="button" aria-label="打开 ${esc(d.title)}">
  <div class="thumb">
    ${poster || ph}
    <div class="thumb-top">
      <span class="badge ${st.cls}"><span class="dot"></span>${st.label}</span>
      <span class="badge live"><span class="dot"></span>live</span>
    </div>
  </div>
  <div class="card-body">
    <div class="card-title"><h3>${esc(d.title)}</h3><span class="card-date">${esc((d.createdAt ?? "").slice(5))}</span></div>
    <p class="card-summary">${esc(d.summary)}</p>
    <div class="card-foot">
      <div class="card-tags">${tags}</div>
      <span class="card-agent" title="${esc(d.agent ?? "")}">${esc(agent)}</span>
    </div>
  </div>
</article>`;
}

function render() {
  if (!demos.length) {
    els.grid.innerHTML = `<div class="notice">demos/ 里还没有 demo。新建 <code>demos/&lt;slug&gt;/index.html</code> 和 <code>demo.json</code>，然后运行 <code>node tools/scan-demos.mjs</code>。</div>`;
    els.empty.hidden = true;
    els.count.textContent = "";
    return;
  }

  unmountAll();
  const list = visibleDemos();
  els.grid.innerHTML = list.map(cardHTML).join("");
  els.empty.hidden = list.length > 0;
  els.count.textContent = `${list.length} / ${demos.length} 个 demo`;
  for (const btn of els.tags.querySelectorAll(".tag")) {
    btn.classList.toggle("on", state.tags.has(btn.dataset.tag));
  }
  writeHash();
}

/* ---------------- live previews ---------------- */

function mountLive(thumb) {
  if (thumb.querySelector("iframe")) return;
  const slug = thumb.closest(".card")?.dataset.slug;
  const demo = bySlug.get(slug);
  if (!demo) return;

  const frame = document.createElement("iframe");
  frame.title = demo.title;
  frame.src = demo.entry;
  frame.tabIndex = -1;
  frame.setAttribute("scrolling", "no");
  frame.style.transform = `scale(${thumb.clientWidth / PREVIEW_W})`;
  frame.addEventListener("load", () => thumb.classList.add("is-live"));
  thumb.append(frame);
  live.push({ thumb, frame });
  trimLive();
}

function unmountLive(thumb) {
  const entry = live.find((l) => l.thumb === thumb);
  if (!entry) return;
  entry.frame.remove();
  live.splice(live.indexOf(entry), 1);
  thumb.classList.remove("is-live");
}

function unmountAll() {
  for (const entry of [...live]) unmountLive(entry.thumb);
  for (const timer of unmountTimers.values()) clearTimeout(timer);
  unmountTimers.clear();
}

function trimLive() {
  while (live.length > MAX_LIVE) unmountLive(live[0].thumb);
}

function scaleLive() {
  for (const { thumb, frame } of live) {
    frame.style.transform = `scale(${thumb.clientWidth / PREVIEW_W})`;
  }
}

/* ---------------- detail ---------------- */

function openDetail(slug) {
  const d = bySlug.get(slug);
  if (!d) return;
  current = d;
  const st = STATUS[d.status] ?? STATUS.stable;

  els.dTitle.textContent = d.title;
  els.dSummary.textContent = d.summary;
  els.dMeta.innerHTML = `
    <dt>状态</dt><dd><span class="badge ${st.cls}" style="border-color:#2b3240"><span class="dot"></span>${st.label}</span></dd>
    <dt>日期</dt><dd class="mono">${esc((d.createdAt ?? "").slice(0, 10))}</dd>
    <dt>Agent</dt><dd class="mono">${esc(d.agent ?? "—")}</dd>
    <dt>标签</dt><dd>${d.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join(" ") || "—"}</dd>
    <dt>入口</dt><dd class="mono">${esc(d.entry)}</dd>`;
  els.dPrompt.textContent = d.prompt ?? "—";
  els.dNotes.textContent = d.notes ?? "";
  els.dNotesBlock.hidden = !d.notes;
  els.dFiles.textContent = (d.files ?? []).join("  ");
  els.dOpen.href = d.entry;
  els.dCopy.disabled = !d.prompt;
  els.dCopy.textContent = "复制";

  els.dFrame.src = d.entry;
  els.stage.style.removeProperty("--w");
  for (const btn of els.stage.parentElement.querySelectorAll("[data-w]")) {
    btn.classList.toggle("on", btn.dataset.w === "100%");
  }
  if (!els.detail.open) els.detail.showModal();
  document.body.classList.add("locked");
  unmountAll();
}

function closeDetail() {
  els.detail.close();
}

els.detail.addEventListener("close", () => {
  els.dFrame.src = "about:blank";
  document.body.classList.remove("locked");
  current = null;
});

els.detail.addEventListener("click", (e) => {
  if (e.target === els.detail) closeDetail();
});

els.dClose.addEventListener("click", closeDetail);
els.dReload.addEventListener("click", () => {
  if (current) els.dFrame.src = current.entry;
});

els.detail.querySelectorAll("[data-w]").forEach((btn) => {
  btn.addEventListener("click", () => {
    els.stage.style.setProperty("--w", btn.dataset.w);
    btn.parentElement.querySelectorAll("[data-w]").forEach((b) => b.classList.toggle("on", b === btn));
  });
});

els.dCopy.addEventListener("click", async () => {
  if (!current?.prompt) return;
  try {
    await navigator.clipboard.writeText(current.prompt);
    els.dCopy.textContent = "已复制";
  } catch {
    els.dCopy.textContent = "复制失败";
  }
  setTimeout(() => { els.dCopy.textContent = "复制"; }, 1400);
});

/* ---------------- events ---------------- */

let searchTimer = 0;
els.q.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = els.q.value; render(); }, 110);
});

els.sort.addEventListener("change", () => { state.sort = els.sort.value; render(); });

els.statusFilter.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-status]");
  if (!btn) return;
  state.status = btn.dataset.status;
  syncStatusButtons();
  render();
});

els.tags.addEventListener("click", (e) => {
  const btn = e.target.closest(".tag");
  if (!btn) return;
  const tag = btn.dataset.tag;
  if (state.tags.has(tag)) state.tags.delete(tag);
  else state.tags.add(tag);
  render();
});

els.reset.addEventListener("click", () => {
  state.q = "";
  state.tags.clear();
  state.status = "all";
  state.sort = "newest";
  els.q.value = "";
  syncStatusButtons();
  render();
});

els.random.addEventListener("click", () => {
  const pool = visibleDemos();
  const list = pool.length ? pool : demos;
  if (!list.length) return;
  openDetail(list[Math.floor(Math.random() * list.length)].slug);
});

els.grid.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (card) openDetail(card.dataset.slug);
});

els.grid.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const card = e.target.closest(".card");
  if (!card) return;
  e.preventDefault();
  openDetail(card.dataset.slug);
});

els.grid.addEventListener("pointerover", (e) => {
  if (!window.matchMedia("(hover: hover)").matches) return;
  const thumb = e.target.closest(".thumb");
  if (!thumb || !els.grid.contains(thumb)) return;
  if (e.relatedTarget instanceof Node && thumb.contains(e.relatedTarget)) return;
  clearTimeout(unmountTimers.get(thumb));
  unmountTimers.delete(thumb);
  mountLive(thumb);
});

els.grid.addEventListener("pointerout", (e) => {
  const thumb = e.target.closest(".thumb");
  if (!thumb) return;
  if (e.relatedTarget instanceof Node && thumb.contains(e.relatedTarget)) return;
  clearTimeout(unmountTimers.get(thumb));
  unmountTimers.set(thumb, setTimeout(() => unmountLive(thumb), 280));
});

window.addEventListener("scroll", () => {
  for (const { thumb } of live) {
    const r = thumb.getBoundingClientRect();
    if (r.bottom < -200 || r.top > innerHeight + 200) unmountLive(thumb);
  }
}, { passive: true });

window.addEventListener("resize", scaleLive);

window.addEventListener("keydown", (e) => {
  const typing = /input|textarea|select/i.test(document.activeElement?.tagName ?? "");
  if (e.key === "/" && !typing) {
    e.preventDefault();
    els.q.focus();
    els.q.select();
  } else if (e.key === "Escape" && document.activeElement === els.q) {
    els.q.value = "";
    state.q = "";
    els.q.blur();
    render();
  }
});

init();
