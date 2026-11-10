// markdown.js — 本站專用的精簡 Markdown 轉換器
// 支援的語法範圍寫在 AGENTS.md「§7 Markdown 語法範圍」。
// 若在這裡新增語法，必須同步更新 AGENTS.md 與 scripts/check.mjs。

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SAFE_URL = /^(https?:|mailto:|#|\.\/|assets\/)/;

// 行內語法：`code`、![圖](路徑)、[[slug]]、[[slug|文字]]、[文字](網址)、**粗體**、*斜體*
function inline(text, ctx) {
  const parts = text.split(/(`[^`]+`)/);
  let out = '';
  for (const part of parts) {
    if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
      out += `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      continue;
    }
    let s = escapeHtml(part);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
      const src = SAFE_URL.test(url) ? url : '';
      return `<figure><img src="${src}" alt="${alt}" loading="lazy">${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`;
    });
    s = s.replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (m, slug, label) => ctx.wikiLink(slug, label));
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const href = SAFE_URL.test(url) ? url : '#';
      const external = /^https?:/.test(url);
      return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out += s;
  }
  return out;
}

const BLOCK_START = /^(```|#{1,4}\s|>|\||[-*]\s+|\d+\.\s+|(-{3,}|\*{3,})\s*$)/;

function joinLines(lines) {
  // 中文換行不補空格；英數字之間才補空格
  return lines.reduce((acc, line) => {
    if (!acc) return line.trim();
    const needSpace = /[A-Za-z0-9.,]$/.test(acc) && /^[A-Za-z0-9]/.test(line.trim());
    return acc + (needSpace ? ' ' : '') + line.trim();
  }, '');
}

const CALLOUT_LABEL = { NOTE: '筆記', TIP: '小技巧', WARN: '注意' };

export function renderMarkdown(src, ctx, headings = []) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  const blank = (l) => /^\s*$/.test(l);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }

    // 程式碼區塊
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      html.push(`<pre><code${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 標題（## ~ ####；# 保留給頁面標題，不在內文使用）
    let m = line.match(/^(#{2,4})\s+(.+?)\s*$/);
    if (m) {
      const level = m[1].length;
      const id = `sec-${headings.length + 1}`;
      headings.push({ level, text: m[2], id });
      html.push(`<h${level} id="${id}">${inline(m[2], ctx)}</h${level}>`);
      i++;
      continue;
    }

    // 分隔線
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { html.push('<hr>'); i++; continue; }

    // 引言 / 提示框（> [!TIP] / > [!NOTE] / > [!WARN]）
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      const cm = buf[0].match(/^\[!(NOTE|TIP|WARN)\]\s*(.*)$/i);
      if (cm) {
        const kind = cm[1].toUpperCase();
        buf[0] = cm[2];
        if (!buf[0]) buf.shift();
        html.push(`<aside class="callout callout-${kind.toLowerCase()}"><p class="callout-label">${CALLOUT_LABEL[kind]}</p>${renderMarkdown(buf.join('\n'), ctx, []).html}</aside>`);
      } else {
        html.push(`<blockquote>${renderMarkdown(buf.join('\n'), ctx, []).html}</blockquote>`);
      }
      continue;
    }

    // 表格
    if (line.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]));
      html.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c, ctx)}</th>`).join('')}</tr></thead>` +
        `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      );
      continue;
    }

    // 清單（不支援巢狀）；- [ ] / - [x] 為核取清單
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const re = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        const buf = [lines[i++].replace(re, '')];
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) buf.push(lines[i++]);
        items.push(joinLines(buf));
      }
      const tag = ordered ? 'ol' : 'ul';
      const lis = items.map((t) => {
        const cb = t.match(/^\[( |x)\]\s+(.*)$/i);
        if (cb) return `<li class="task"><span class="box${cb[1].toLowerCase() === 'x' ? ' done' : ''}" aria-hidden="true"></span>${inline(cb[2], ctx)}</li>`;
        return `<li>${inline(t, ctx)}</li>`;
      });
      html.push(`<${tag}>${lis.join('')}</${tag}>`);
      continue;
    }

    // 段落
    const buf = [line];
    i++;
    while (i < lines.length && !blank(lines[i]) && !BLOCK_START.test(lines[i])) buf.push(lines[i++]);
    html.push(`<p>${inline(joinLines(buf), ctx)}</p>`);
  }

  return { html: html.join('\n'), headings };
}

// 找出內文中所有 [[slug]] 連結（給反向連結與檢查腳本使用）
export function findWikiLinks(src) {
  return [...src.matchAll(/\[\[([a-z0-9-]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1]);
}
