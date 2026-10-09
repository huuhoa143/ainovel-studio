// Markdown → HTML cho cửa sổ xem tài liệu pháp lý (PRIVACY.md, DISCLAIMER.md,
// THIRD_PARTY_NOTICES.md). Chỉ đủ cho tài liệu của chính ta, không phải CommonMark đầy đủ.
//
// Luật an toàn duy nhất: MỌI ký tự của nguồn đi qua escapeHtml trước khi vào đầu ra; thẻ HTML
// chỉ do renderer tự sinh. HTML thô trong nguồn hiện ra đúng như chữ, liên kết chỉ giữ http(s)
// và neo `#…` (javascript:, data:, file:, đường dẫn tương đối → chỉ còn chữ), ảnh chỉ còn chữ
// alt (trang không tải gì từ ngoài). Không import electron để vitest kiểm được.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** URL an toàn để làm href, hoặc null. Chỉ http(s) tuyệt đối và neo trong trang. */
export function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (/^#[^\s]*$/.test(url)) return url;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** id cho tiêu đề kiểu GitHub: chữ thường, bỏ dấu câu, dấu cách → `-`. Giữ chữ có dấu. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

// Ký tự vùng riêng làm chỗ giữ chỗ cho đoạn đã render (code, liên kết); bị xóa khỏi nguồn
// trước nên nguồn không giả mạo được.
const PH_OPEN = '\uE000';
const PH_CLOSE = '\uE001';
const PH_RE = /\uE000(\d+)\uE001/g;

/** Vị trí `]` khớp với mỗi `[` (−1 nếu không khớp) — tính một lượt bằng ngăn xếp, để một dòng
 *  đầy `[` không thành O(n²). */
function bracketPairs(s: string): Int32Array {
  const pairs = new Int32Array(s.length).fill(-1);
  const stack: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') i++;
    else if (c === '[') stack.push(i);
    else if (c === ']' && stack.length > 0) pairs[stack.pop()!] = i;
  }
  return pairs;
}

/** `(url "title")` bắt đầu ở `open`; trả về url và vị trí sau `)`, hoặc null. */
function parseLinkDest(s: string, open: number): { url: string; end: number } | null {
  let i = open + 1;
  while (s[i] === ' ') i++;
  let url = '';
  if (s[i] === '<') {
    const close = s.indexOf('>', i);
    if (close < 0) return null;
    url = s.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    const start = i;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === ' ') break;
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) break;
        depth--;
      }
    }
    url = s.slice(start, i);
  }
  while (s[i] === ' ') i++;
  // Tiêu đề bị bỏ — không cần cho tài liệu, và bớt một chỗ phải escape.
  if (s[i] === '"' || s[i] === "'") {
    const close = s.indexOf(s[i], i + 1);
    if (close < 0) return null;
    i = close + 1;
    while (s[i] === ' ') i++;
  }
  return s[i] === ')' ? { url, end: i + 1 } : null;
}

const BARE_URL = /https?:\/\/[^\s<>"'`\]\[]+/y;

function trimUrlTail(url: string): string {
  // Dấu câu cuối câu không thuộc URL; `)` chỉ bỏ khi không cân với `(` trong URL.
  for (;;) {
    const last = url[url.length - 1];
    if (/[.,;:!?*_]/.test(last)) url = url.slice(0, -1);
    else if (last === ')' && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) url = url.slice(0, -1);
    else return url;
  }
}

function anchor(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}">${label}</a>`;
}

/** Render một dòng/đoạn inline. `links=false` bên trong chữ của liên kết (không lồng <a>). */
export function renderInline(src: string, links = true): string {
  const parts: string[] = [];
  const hold = (html: string) => `${PH_OPEN}${parts.push(html) - 1}${PH_CLOSE}`;
  let out = '';
  let i = 0;
  const s = src.replace(/[\uE000\uE001]/g, '');
  let pairs: Int32Array | null = null;

  while (i < s.length) {
    const c = s[i];

    if (c === '\\' && i + 1 < s.length && /[\\`*_{}\[\]()#+\-.!|<>~]/.test(s[i + 1])) {
      out += hold(escapeHtml(s[i + 1]));
      i += 2;
      continue;
    }

    if (c === '`') {
      let n = 0;
      while (s[i + n] === '`') n++;
      const fence = '`'.repeat(n);
      const close = s.indexOf(fence, i + n);
      if (close > 0) {
        const code = s.slice(i + n, close).replace(/^ (.*) $/, '$1');
        out += hold(`<code>${escapeHtml(code)}</code>`);
        i = close + n;
        continue;
      }
      out += fence;
      i += n;
      continue;
    }

    const isImage = c === '!' && s[i + 1] === '[';
    if (c === '[' || isImage) {
      const open = isImage ? i + 1 : i;
      pairs ??= bracketPairs(s);
      const close = pairs[open];
      const dest = close > 0 && s[close + 1] === '(' ? parseLinkDest(s, close + 1) : null;
      if (dest) {
        const text = s.slice(open + 1, close);
        if (isImage) {
          out += hold(escapeHtml(text));
        } else {
          const label = renderInline(text, false);
          const href = links ? safeHref(dest.url) : null;
          out += hold(href ? anchor(href, label) : label);
        }
        i = dest.end;
        continue;
      }
    }

    if (c === '<') {
      const m = /^<(https?:\/\/[^\s<>]+)>/i.exec(s.slice(i, i + 2048));
      const href = m && safeHref(m[1]);
      if (m && href) {
        out += hold(links ? anchor(href, escapeHtml(m[1])) : escapeHtml(m[1]));
        i += m[0].length;
        continue;
      }
    }

    if (links && (c === 'h' || c === 'H') && (i === 0 || !/[\p{L}\p{N}]/u.test(s[i - 1]))) {
      BARE_URL.lastIndex = i;
      const m = BARE_URL.exec(s);
      if (m) {
        const url = trimUrlTail(m[0]);
        const href = safeHref(url);
        if (href) {
          out += hold(anchor(href, escapeHtml(url)));
          i += url.length;
          continue;
        }
      }
    }

    out += c;
    i++;
  }

  // Phần còn lại là chữ thường: escape rồi mới chèn thẻ nhấn mạnh — sau escape không còn `<`
  // nào của nguồn, nên regex dưới đây không thể mở thẻ lạ.
  let html = escapeHtml(out);
  html = html.replace(/\*\*(?=\S)([^*]*?\S)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^\p{L}\p{N}_])__(?=\S)([^_]*?\S)__(?![\p{L}\p{N}_])/gu, '$1<strong>$2</strong>');
  html = html.replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, '<em>$1</em>');
  html = html.replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])([^_]*?[^\s_])_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>');
  html = html.replace(/~~(?=\S)([^~]*?\S)~~/g, '<del>$1</del>');
  // Ngắt dòng cứng: hai dấu cách hoặc `\` cuối dòng. Xét từng dòng thay vì regex ` {2,}\n` —
  // regex đó O(n²) trên một dãy dấu cách dài.
  const lines = html.split('\n');
  for (let k = 0; k < lines.length - 1; k++) {
    const l = lines[k];
    if (l.endsWith('  ')) lines[k] = l.trimEnd() + '<br>';
    else if (l.endsWith('\\')) lines[k] = l.slice(0, -1) + '<br>';
  }
  return lines.join('\n').replace(PH_RE, (_m, n: string) => parts[Number(n)]);
}

// ---------------------------------------------------------------------------- khối

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const LIST_ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)/;
const TABLE_SEP = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;

function isBlank(line: string): boolean {
  return line.trim() === '';
}

function startsBlock(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || LIST_ITEM.test(line);
}

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '\\' && row[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (row[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += row[i];
    }
  }
  cells.push(cur.trim());
  return cells;
}

interface Ctx {
  slugs: Map<string, number>;
}

function headingId(ctx: Ctx, text: string): string {
  const base = slugify(text) || 'muc';
  const n = ctx.slugs.get(base) ?? 0;
  ctx.slugs.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

function heading(ctx: Ctx, level: number, text: string): string {
  return `<h${level} id="${escapeHtml(headingId(ctx, text))}">${renderInline(text)}</h${level}>`;
}

/** Bỏ chú thích HTML (`<!-- legal-version: N -->`…) — markdown vốn không hiện chúng. */
function stripComments(lines: string[]): string[] {
  const out: string[] = [];
  let inComment = false;
  for (const line of lines) {
    if (inComment) {
      if (line.includes('-->')) inComment = false;
      continue;
    }
    if (/^ {0,3}<!--/.test(line)) {
      if (!line.includes('-->')) inComment = true;
      else if (!/-->[ \t]*$/.test(line)) out.push(line); // chú thích giữa dòng: giữ, sẽ hiện như chữ
      continue;
    }
    out.push(line);
  }
  return out;
}

function renderBlocks(lines: string[], ctx: Ctx): string {
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const closeFence = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}[ \\t]*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !closeFence.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // dấu đóng (hoặc hết tệp)
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      // `## Tiêu đề ##` — dãy # đóng (đứng sau dấu cách) không thuộc tiêu đề.
      const text = line.slice(h[0].length).trim();
      const closing = /(?:^|[ \t])#+$/.exec(text);
      out.push(heading(ctx, h[1].length, closing ? text.slice(0, closing.index).trim() : text));
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && !isBlank(lines[i])) {
        body.push(lines[i].replace(QUOTE, ''));
        i++;
      }
      out.push(`<blockquote>${renderBlocks(body, ctx)}</blockquote>`);
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const r = renderList(lines, i, ctx);
      out.push(r.html);
      i = r.next;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : '',
      );
      const cell = (tag: string, text: string, k: number) =>
        `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${renderInline(text)}</${tag}>`;
      const rows: string[] = [];
      i += 2;
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
        const cells = splitRow(lines[i]);
        rows.push(`<tr>${head.map((_, k) => cell('td', cells[k] ?? '', k)).join('')}</tr>`);
        i++;
      }
      out.push(
        `<div class="table"><table><thead><tr>${head.map((t, k) => cell('th', t, k)).join('')}</tr></thead>` +
          `<tbody>${rows.join('')}</tbody></table></div>`,
      );
      continue;
    }

    // Đoạn văn: gom tới dòng trống hoặc khối khác. Dòng `===`/`---` ngay sau = tiêu đề setext.
    const para: string[] = [line];
    i++;
    let setext = 0;
    while (i < lines.length && !isBlank(lines[i])) {
      const s = SETEXT.exec(lines[i]);
      if (s) {
        setext = s[1][0] === '=' ? 1 : 2;
        i++;
        break;
      }
      if (startsBlock(lines[i])) break;
      para.push(lines[i]);
      i++;
    }
    const text = para.map((l) => l.replace(/^[ \t]+/, '')).join('\n');
    out.push(setext ? heading(ctx, setext, text.replace(/\s+/g, ' ').trim()) : `<p>${renderInline(text)}</p>`);
  }
  return out.join('\n');
}

/** Danh sách "chặt": mục chỉ có một đoạn văn (có thể kèm danh sách con) thì bỏ <p> cho gọn.
 *  Chuỗi `</p>` chỉ có thể do renderer sinh — chữ của nguồn đã bị escape. */
function unwrapLeadParagraph(html: string): string {
  if (!html.startsWith('<p>')) return html;
  const end = html.indexOf('</p>');
  const rest = html.slice(end + 4);
  if (rest === '' || rest.startsWith('\n<ul') || rest.startsWith('\n<ol')) return html.slice(3, end) + rest;
  return html;
}

function renderList(lines: string[], start: number, ctx: Ctx): { html: string; next: number } {
  const first = LIST_ITEM.exec(lines[start])!;
  const ordered = /\d/.test(first[2]);
  const delim = first[2].slice(-1);
  const startNum = ordered ? parseInt(first[2], 10) : 1;
  const items: string[][] = [];
  let i = start;
  let loose = false;

  while (i < lines.length) {
    const m = LIST_ITEM.exec(lines[i]);
    if (!m || /\d/.test(m[2]) !== ordered || m[2].slice(-1) !== delim) break;
    // Dòng tiếp theo thuộc mục này nếu thụt ít nhất tới cột nội dung (hoặc là dòng nối lười).
    const indent = m[1].length + m[2].length + Math.min(Math.max(m[3].length, 1), 4);
    const body = [lines[i].slice(m[0].length)];
    i++;
    let sawBlank = false;
    while (i < lines.length) {
      const l = lines[i];
      if (isBlank(l)) {
        sawBlank = true;
        body.push('');
        i++;
        continue;
      }
      const lead = l.length - l.replace(/^ +/, '').length;
      if (lead >= indent) {
        if (sawBlank) loose = true;
        body.push(l.slice(indent));
        sawBlank = false;
        i++;
        continue;
      }
      if (!sawBlank && !startsBlock(l)) {
        body.push(l.trim());
        i++;
        continue;
      }
      break;
    }
    // Dòng trống giữa hai mục cũng làm danh sách "lỏng" (mỗi mục là đoạn văn).
    while (body.length > 0 && body[body.length - 1] === '') body.pop();
    if (sawBlank && i < lines.length && LIST_ITEM.test(lines[i])) loose = true;
    items.push(body);
  }

  const lis = items.map((body) => {
    const inner = renderBlocks(body, ctx);
    return `<li>${loose ? inner : unwrapLeadParagraph(inner)}</li>`;
  });
  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && startNum !== 1 ? ` start="${startNum}"` : '';
  return { html: `<${tag}${startAttr}>\n${lis.join('\n')}\n</${tag}>`, next: i };
}

/** Tài liệu markdown → đoạn HTML (không có <html>/<body>). */
export function renderMarkdown(src: string): string {
  const lines = stripComments(src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'));
  return renderBlocks(lines, { slugs: new Map() });
}
