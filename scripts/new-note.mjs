#!/usr/bin/env node
// new-note.mjs — 依範本建立一篇新筆記，並把項目加進 content/notes.json。
// 用法：node scripts/new-note.mjs <slug> <type> <category> "<標題>"
// 例如：node scripts/new-note.mjs water-quality concept basics "水質"
// 建好之後請補上摘要、標籤、related 與內文，最後執行 node scripts/check.mjs。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [slug, type, category, title] = process.argv.slice(2);
const config = JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8'));
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

if (!slug || !type || !category || !title) fail('用法：node scripts/new-note.mjs <slug> <type> <category> "<標題>"');
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail('slug 只能用小寫英文、數字與連字號');
if (!config.types.some((t) => t.id === type)) fail(`type 必須是：${config.types.map((t) => t.id).join(' / ')}`);
if (!config.categories.some((c) => c.id === category)) fail(`category 必須是：${config.categories.map((c) => c.id).join(' / ')}`);

const file = join(root, 'content/notes', `${slug}.md`);
if (existsSync(file)) fail(`content/notes/${slug}.md 已經存在`);

const manifestPath = join(root, 'content/notes.json');
const notes = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (notes.some((n) => n.slug === slug)) fail(`notes.json 已經有 ${slug}`);

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
const entry = { slug, title, category, type, tags: ['待補'], summary: '（待補：10～50 字的一句話摘要）', updated: today, related: [] };

// 插在同分類最後一篇之後，讓分類內的閱讀順序保持連續
let at = notes.length;
for (let i = notes.length - 1; i >= 0; i--) if (notes[i].category === category) { at = i + 1; break; }
notes.splice(at, 0, entry);

writeFileSync(file, readFileSync(join(root, 'templates', `${type}.md`), 'utf8'));
writeFileSync(manifestPath, JSON.stringify(notes, null, 2) + '\n');
console.log(`✓ 已建立 content/notes/${slug}.md，並加入 notes.json（第 ${at + 1} 筆）`);
console.log('  接下來：補上摘要、標籤、related 與內文，再執行 node scripts/check.mjs');
