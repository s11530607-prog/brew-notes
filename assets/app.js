// app.js — 讀取設定與筆記清單，依網址 hash 切換頁面。
// 路由一覽（新增路由時要同步更新 AGENTS.md §3）：
//   #/                 首頁（搜尋、分類、最近更新）
//   #/note/<slug>      單篇筆記
//   #/category/<id>    分類列表
//   #/tag/<標籤>        標籤列表
//   #/page/<slug>      獨立頁面（例如「關於」）

import { renderMarkdown, escapeHtml, findWikiLinks } from './markdown.js';

const app = document.getElementById('app');
const state = { config: null, notes: [], bySlug: new Map(), bodies: new Map(), allBodies: null };

const fetchText = async (url) => {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}（${res.status}）`);
  return res.text();
};
const fetchJSON = async (url) => JSON.parse(await fetchText(url));

const notePath = (slug) => `content/notes/${slug}.md`;
const loadBody = (slug) => {
  if (!state.bodies.has(slug)) state.bodies.set(slug, fetchText(notePath(slug)));
  return state.bodies.get(slug);
};
const loadAllBodies = () => {
  if (!state.allBodies) {
    state.allBodies = Promise.all(
      state.notes.map(async (n) => [n.slug, await loadBody(n.slug).catch(() => '')])
    ).then((pairs) => new Map(pairs));
  }
  return state.allBodies;
};

const category = (id) => state.config.categories.find((c) => c.id === id);
const typeName = (id) => (state.config.types.find((t) => t.id === id) || {}).name || id;
const noteNo = (slug) => String(state.notes.findIndex((n) => n.slug === slug) + 1).padStart(2, '0');
const fmtDate = (d) => d.replaceAll('-', '.');

// ---------- 共用元件 ----------

const tagChips = (tags) =>
  `<ul class="tags">${tags.map((t) => `<li><a href="#/tag/${encodeURIComponent(t)}">#${escapeHtml(t)}</a></li>`).join('')}</ul>`;

const noteCard = (n) => `
  <a class="note-card" href="#/note/${n.slug}">
    <span class="note-card-meta"><span class="no">No.${noteNo(n.slug)}</span>${escapeHtml(category(n.category).name)} · ${typeName(n.type)}</span>
    <span class="note-card-title">${escapeHtml(n.title)}</span>
    <span class="note-card-summary">${escapeHtml(n.summary)}</span>
    <span class="note-card-date">更新於 ${fmtDate(n.updated)}</span>
  </a>`;

const noteGrid = (list, empty = '這裡還沒有筆記。') =>
  list.length ? `<div class="note-grid">${list.map(noteCard).join('')}</div>` : `<p class="empty">${empty}</p>`;

const wikiLink = (slug, label) => {
  const n = state.bySlug.get(slug);
  if (!n) return `<span class="wikilink missing" title="這篇筆記尚未建立">${escapeHtml(label || slug)}</span>`;
  return `<a class="wikilink" href="#/note/${slug}">${escapeHtml(label || n.title)}</a>`;
};

function setTitle(part) {
  document.title = part ? `${part}｜${state.config.title}` : `${state.config.title}｜${state.config.subtitle}`;
}

// ---------- 頁面 ----------

function viewHome() {
  setTitle();
  const { config, notes } = state;
  const start = state.bySlug.get(config.startHere);
  const latest = [...notes].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 6);
  const lastUpdate = latest[0] ? fmtDate(latest[0].updated) : '—';

  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">${escapeHtml(config.subtitle)}</p>
      <h1>${escapeHtml(config.title)}</h1>
      <p class="lead">${escapeHtml(config.description)}</p>
      <dl class="stats">
        <div><dt>筆記</dt><dd>${notes.length}</dd></div>
        <div><dt>分類</dt><dd>${config.categories.length}</dd></div>
        <div><dt>最近更新</dt><dd>${lastUpdate}</dd></div>
      </dl>
      ${start ? `<a class="start-here" href="#/note/${start.slug}"><span>第一次來？從這篇開始</span><strong>${escapeHtml(start.title)} →</strong></a>` : ''}
    </section>

    <section class="search-block">
      <label for="q" class="section-label">搜尋筆記</label>
      <input id="q" type="search" placeholder="輸入關鍵字，例如：水溫、酸、V60" autocomplete="off">
      <div id="results" aria-live="polite"></div>
    </section>

    <section>
      <h2 class="section-label">分類</h2>
      <div class="cat-grid">
        ${config.categories.map((c) => {
          const count = notes.filter((n) => n.category === c.id).length;
          return `<a class="cat-card" href="#/category/${c.id}">
            <span class="cat-name">${escapeHtml(c.name)}</span>
            <span class="cat-desc">${escapeHtml(c.description)}</span>
            <span class="cat-count">${count} 篇</span></a>`;
        }).join('')}
      </div>
    </section>

    <section id="latest">
      <h2 class="section-label">最近更新</h2>
      ${noteGrid(latest)}
    </section>`;

  const input = document.getElementById('q');
  const results = document.getElementById('results');
  const latestSec = document.getElementById('latest');
  input.addEventListener('input', async () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; latestSec.hidden = false; return; }
    latestSec.hidden = true;
    const bodies = await loadAllBodies();
    const hits = notes.filter((n) =>
      [n.title, n.summary, ...n.tags, bodies.get(n.slug) || ''].join(' ').toLowerCase().includes(q)
    );
    if (input.value.trim().toLowerCase() !== q) return;
    results.innerHTML = `<p class="result-count">找到 ${hits.length} 篇</p>${noteGrid(hits, '沒有符合的筆記，換個關鍵字試試。')}`;
  });
}

async function viewNote(slug) {
  const n = state.bySlug.get(slug);
  if (!n) return viewNotFound(`找不到筆記「${slug}」。`);
  setTitle(n.title);
  const cat = category(n.category);

  app.innerHTML = `<p class="loading">載入中…</p>`;
  let src;
  try { src = await loadBody(slug); } catch (e) { return viewError(e); }
  const { html, headings } = renderMarkdown(src, { wikiLink });

  const siblings = state.notes.filter((x) => x.category === n.category);
  const idx = siblings.findIndex((x) => x.slug === slug);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];
  const related = (n.related || []).map((s) => state.bySlug.get(s)).filter(Boolean);
  const toc = headings.filter((h) => h.level === 2);

  app.innerHTML = `
    <nav class="crumbs" aria-label="麵包屑"><a href="#/">首頁</a><span>/</span><a href="#/category/${cat.id}">${escapeHtml(cat.name)}</a></nav>
    <header class="note-head">
      <p class="eyebrow"><span class="no">No.${noteNo(slug)}</span>${typeName(n.type)}</p>
      <h1>${escapeHtml(n.title)}</h1>
      <p class="lead">${escapeHtml(n.summary)}</p>
      <div class="note-meta"><span>更新於 ${fmtDate(n.updated)}</span>${tagChips(n.tags)}</div>
    </header>
    <div class="note-layout">
      ${toc.length ? `<aside class="toc"><p class="section-label">本頁段落</p><ol>${toc.map((h) => `<li><a href="#/note/${slug}" data-scroll="${h.id}">${escapeHtml(h.text)}</a></li>`).join('')}</ol></aside>` : ''}
      <article class="prose">${html}</article>
    </div>
    ${related.length ? `<section class="after"><h2 class="section-label">相關筆記</h2>${noteGrid(related)}</section>` : ''}
    <section class="after" id="backlinks"></section>
    <nav class="pager">
      ${prev ? `<a href="#/note/${prev.slug}" class="prev"><span>上一篇</span>${escapeHtml(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a href="#/note/${next.slug}" class="next"><span>下一篇</span>${escapeHtml(next.title)}</a>` : '<span></span>'}
    </nav>`;
  window.scrollTo(0, 0);

  const bodies = await loadAllBodies();
  const back = state.notes.filter((x) => x.slug !== slug && findWikiLinks(bodies.get(x.slug) || '').includes(slug));
  const box = document.getElementById('backlinks');
  if (box && back.length) box.innerHTML = `<h2 class="section-label">提到這篇的筆記</h2>${noteGrid(back)}`;
}

function viewCategory(id) {
  const cat = category(id);
  if (!cat) return viewNotFound(`找不到分類「${id}」。`);
  setTitle(cat.name);
  const list = state.notes.filter((n) => n.category === id);
  app.innerHTML = `
    <nav class="crumbs"><a href="#/">首頁</a></nav>
    <header class="page-head"><p class="eyebrow">分類</p><h1>${escapeHtml(cat.name)}</h1><p class="lead">${escapeHtml(cat.description)}</p></header>
    ${noteGrid(list)}`;
  window.scrollTo(0, 0);
}

function viewTag(tag) {
  setTitle(`#${tag}`);
  const list = state.notes.filter((n) => n.tags.includes(tag));
  app.innerHTML = `
    <nav class="crumbs"><a href="#/">首頁</a></nav>
    <header class="page-head"><p class="eyebrow">標籤</p><h1>#${escapeHtml(tag)}</h1><p class="lead">共 ${list.length} 篇筆記</p></header>
    ${noteGrid(list)}`;
  window.scrollTo(0, 0);
}

async function viewPage(slug) {
  const page = state.config.pages.find((p) => p.slug === slug);
  if (!page) return viewNotFound(`找不到頁面「${slug}」。`);
  setTitle(page.title);
  let src;
  try { src = await fetchText(`content/pages/${slug}.md`); } catch (e) { return viewError(e); }
  const { html } = renderMarkdown(src, { wikiLink });
  app.innerHTML = `
    <nav class="crumbs"><a href="#/">首頁</a></nav>
    <header class="page-head"><h1>${escapeHtml(page.title)}</h1></header>
    <article class="prose solo">${html}</article>`;
  window.scrollTo(0, 0);
}

function viewNotFound(msg) {
  setTitle('找不到頁面');
  app.innerHTML = `<section class="page-head"><p class="eyebrow">404</p><h1>這頁不存在</h1><p class="lead">${escapeHtml(msg)}</p><p><a class="btn" href="#/">回首頁</a></p></section>`;
}

function viewError(err) {
  app.innerHTML = `<section class="page-head"><p class="eyebrow">載入失敗</p><h1>讀不到檔案</h1>
    <p class="lead">${escapeHtml(err.message)}</p>
    <p class="hint">如果你是直接雙擊 index.html 開啟，瀏覽器會擋住讀檔。請在專案資料夾執行 <code>python3 -m http.server</code>，再開 <code>http://localhost:8000</code>。</p></section>`;
}

// ---------- 路由 ----------

function route() {
  const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [kind, ...rest] = hash.split('/');
  const arg = rest.join('/');
  document.querySelectorAll('.site-nav a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === `#/${kind}/${arg}`);
  });
  if (!kind) return viewHome();
  if (kind === 'note') return viewNote(arg);
  if (kind === 'category') return viewCategory(arg);
  if (kind === 'tag') return viewTag(arg);
  if (kind === 'page') return viewPage(arg);
  return viewNotFound(`網址「#/${hash}」沒有對應的頁面。`);
}

function renderChrome() {
  const { config } = state;
  document.getElementById('brand-title').textContent = config.title;
  document.getElementById('site-nav').innerHTML =
    config.categories.map((c) => `<a href="#/category/${c.id}">${escapeHtml(c.name)}</a>`).join('') +
    config.pages.map((p) => `<a href="#/page/${p.slug}">${escapeHtml(p.title)}</a>`).join('');
  document.getElementById('footer').innerHTML =
    `<p>${escapeHtml(config.title)} · ${escapeHtml(config.author)} 的個人筆記</p>
     <p>網站依照 <a href="${config.repoUrl}/blob/main/AGENTS.md" target="_blank" rel="noopener">AGENTS.md</a> 的規則由 AI 協作維護 · <a href="${config.repoUrl}" target="_blank" rel="noopener">GitHub</a></p>`;
}

// 本頁段落連結：只捲動，不改變網址
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-scroll]');
  if (!a) return;
  e.preventDefault();
  document.getElementById(a.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

async function boot() {
  try {
    const [config, notes] = await Promise.all([fetchJSON('site.config.json'), fetchJSON('content/notes.json')]);
    state.config = config;
    state.notes = notes;
    notes.forEach((n) => state.bySlug.set(n.slug, n));
  } catch (e) {
    return viewError(e);
  }
  renderChrome();
  window.addEventListener('hashchange', route);
  route();
}

boot();
