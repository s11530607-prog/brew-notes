#!/usr/bin/env node
// check.mjs — 檢查整個知識庫是否符合 AGENTS.md 的規則。
// 用法：node scripts/check.mjs
// 結果：有「錯誤」時結束代碼為 1（GitHub Actions 會顯示失敗）；「警告」不會讓檢查失敗。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const slugs = new Set();
const err = (where, msg) => errors.push(`✗ ${where}：${msg}`);
const warn = (where, msg) => warnings.push(`△ ${where}：${msg}`);

const readJSON = (p) => {
  try { return JSON.parse(readFileSync(join(root, p), 'utf8')); }
  catch (e) { err(p, `無法讀取或不是合法 JSON（${e.message}）`); return null; }
};

const config = readJSON('site.config.json');
const notes = readJSON('content/notes.json');
if (!config || !notes) finish();

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED = ['slug', 'title', 'category', 'type', 'tags', 'summary', 'updated', 'related'];
const categoryIds = new Set(config.categories.map((c) => c.id));
const types = new Map(config.types.map((t) => [t.id, t]));

// ---- site.config.json ----
if (!config.startHere || !notes.some((n) => n.slug === config.startHere)) {
  err('site.config.json', `startHere「${config.startHere}」不是已存在的筆記`);
}
for (const p of config.pages || []) {
  if (!existsSync(join(root, 'content/pages', `${p.slug}.md`))) err('site.config.json', `頁面 content/pages/${p.slug}.md 不存在`);
}

// ---- notes.json 每一筆 ----
if (!Array.isArray(notes)) err('content/notes.json', '最外層必須是陣列');
for (const [i, n] of (Array.isArray(notes) ? notes : []).entries()) {
  const where = `notes.json 第 ${i + 1} 筆（${n.slug || '無 slug'}）`;
  for (const key of REQUIRED) if (!(key in n)) err(where, `缺少欄位 ${key}`);
  for (const key of Object.keys(n)) if (!REQUIRED.includes(key)) err(where, `多了規格外的欄位 ${key}`);

  if (!SLUG.test(n.slug || '')) err(where, 'slug 只能用小寫英文、數字與連字號（例如 water-temperature）');
  if (slugs.has(n.slug)) err(where, 'slug 重複');
  slugs.add(n.slug);

  if (!categoryIds.has(n.category)) err(where, `category「${n.category}」不在 site.config.json 的分類中`);
  if (!types.has(n.type)) err(where, `type「${n.type}」不在 site.config.json 的類型中`);
  if (typeof n.title !== 'string' || n.title.length > 24) err(where, '標題必須是 24 字以內的字串');
  if (typeof n.summary !== 'string' || n.summary.length < 10 || n.summary.length > 50) err(where, '摘要必須是 10～50 字');
  if (!DATE.test(n.updated || '') || Number.isNaN(Date.parse(n.updated))) err(where, 'updated 必須是 YYYY-MM-DD 格式的日期');
  if (!Array.isArray(n.tags) || n.tags.length < 1 || n.tags.length > 4) err(where, 'tags 必須是 1～4 個標籤的陣列');
  if (JSON.stringify(n).includes('待補')) err(where, '還有「待補」的欄位沒有填寫');
  if (!Array.isArray(n.related) || n.related.length > 3) err(where, 'related 必須是 0～3 個 slug 的陣列');
}

// ---- 筆記檔案 ----
const notesDir = join(root, 'content/notes');
const files = existsSync(notesDir) ? readdirSync(notesDir).filter((f) => f.endsWith('.md')) : [];
for (const f of files) {
  if (!slugs.has(f.replace(/\.md$/, ''))) err(`content/notes/${f}`, '檔案存在，但 notes.json 沒有對應的項目');
}

for (const n of Array.isArray(notes) ? notes : []) {
  const file = `content/notes/${n.slug}.md`;
  for (const r of n.related || []) {
    if (r === n.slug) err(file, 'related 不能包含自己');
    else if (!slugs.has(r)) err(file, `related 指向不存在的筆記「${r}」`);
  }
  if (!existsSync(join(root, file))) { err(file, '檔案不存在'); continue; }
  const src = readFileSync(join(root, file), 'utf8');
  const lines = src.split(/\r?\n/);

  // 不可有 H1、YAML front matter、HTML 標籤
  if (lines[0] === '---') err(file, '不要使用 front matter，資料寫在 notes.json');
  lines.forEach((l, i) => {
    if (/^#\s/.test(l)) err(`${file}:${i + 1}`, '內文不可使用 # 一級標題（標題由 notes.json 提供）');
    if (/^#{5,}\s/.test(l)) err(`${file}:${i + 1}`, '標題最多到 ####');
    if (/<\/?[a-z][^>]*>/i.test(l) && !l.startsWith('    ')) err(`${file}:${i + 1}`, '不可直接寫 HTML 標籤');
    if (/^\s{2,}[-*]\s/.test(l)) err(`${file}:${i + 1}`, '不支援巢狀清單');
  });

  if (src.includes('another-note-slug')) err(file, '範本的佔位連結 [[another-note-slug]] 還沒換掉');
  if (/（某種效果）|（某件事）|選項 A|第一步：做什麼/.test(src)) err(file, '還留有範本的說明文字，請換成真正的內容');

  // 必備段落（依類型、依順序）
  const h2 = lines.filter((l) => /^##\s/.test(l)).map((l) => l.replace(/^##\s+/, '').trim());
  const required = types.get(n.type)?.sections || [];
  let cursor = 0;
  for (const sec of required) {
    const at = h2.indexOf(sec, cursor);
    if (at === -1) err(file, `缺少必備段落「## ${sec}」（或順序錯誤）`);
    else cursor = at + 1;
  }

  // 內部連結
  for (const m of src.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    if (!SLUG.test(m[1])) err(file, `內部連結 [[${m[1]}]] 的 slug 格式錯誤`);
    else if (!slugs.has(m[1])) warn(file, `內部連結 [[${m[1]}]] 指向尚未建立的筆記（網頁上會顯示為虛線）`);
  }

  // 圖片
  for (const m of src.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    if (!m[1].trim()) err(file, `圖片 ${m[2]} 缺少替代文字`);
    if (!/^https?:/.test(m[2])) {
      if (!m[2].startsWith('assets/images/')) err(file, `圖片 ${m[2]} 必須放在 assets/images/`);
      else if (!existsSync(join(root, m[2]))) err(file, `圖片 ${m[2]} 不存在`);
    }
  }

  // 提示框數量
  const callouts = (src.match(/^>\s*\[!(NOTE|TIP|WARN)\]/gim) || []).length;
  if (callouts > 2) warn(file, `提示框有 ${callouts} 個，建議每篇最多 2 個`);

  // 長度
  const chars = src.replace(/\s/g, '').length;
  if (chars < 300) warn(file, `內文只有約 ${chars} 字，建議至少 300 字`);
  if (chars > 2500) warn(file, `內文約 ${chars} 字，超過 2500 字建議拆成兩篇`);

}

// 孤兒筆記：沒有任何其他筆記連過來
const linked = new Set();
for (const n of Array.isArray(notes) ? notes : []) {
  const p = join(root, `content/notes/${n.slug}.md`);
  if (existsSync(p)) for (const m of readFileSync(p, 'utf8').matchAll(/\[\[([a-z0-9-]+)/g)) if (m[1] !== n.slug) linked.add(m[1]);
  for (const r of n.related || []) linked.add(r);
}
for (const s of slugs) if (!linked.has(s) && s !== config.startHere) warn(`content/notes/${s}.md`, '沒有任何筆記連到這篇，記得在相關筆記加上 [[連結]]');

finish();

function finish() {
  console.log(`\n沖煮手帖 規則檢查 — ${slugs.size} 篇筆記\n`);
  for (const e of errors) console.log(e);
  for (const w of warnings) console.log(w);
  console.log(`\n錯誤 ${errors.length} 個，警告 ${warnings.length} 個。${errors.length ? '請修正錯誤後再提交。' : '通過 ✓'}\n`);
  process.exit(errors.length ? 1 : 0);
}
