import { describe, expect, it } from 'vitest';
import { renderInline, renderMarkdown, safeHref, slugify } from '../src/main/markdown';

// Mọi thẻ trong đầu ra phải thuộc danh sách renderer tự sinh; thuộc tính chỉ có href/id/start/style.
const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'del', 'code', 'pre',
  'a', 'blockquote', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div',
]);

function assertOnlySafeTags(html: string) {
  for (const m of html.matchAll(/<\/?([a-zA-Z0-9]+)([^>]*)>/g)) {
    expect(ALLOWED_TAGS.has(m[1].toLowerCase()), `thẻ lạ <${m[1]}> trong: ${html}`).toBe(true);
    const attrs = m[2].trim();
    if (attrs) {
      expect(attrs, `thuộc tính lạ trong: ${m[0]}`).toMatch(
        /^(href="(https?:\/\/|#)[^"]*"|id="[^"]*"|start="\d+"|class="table"|style="text-align:(left|right|center)")$/,
      );
    }
  }
}

describe('renderMarkdown — an toàn', () => {
  const evil = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">bấm</a>',
    '[bấm](javascript:alert(1))',
    '[bấm](JavaScript:alert(1))',
    '[bấm]( javascript:alert(1) )',
    '[bấm](java\tscript:alert(1))',
    '[bấm](data:text/html,<script>alert(1)</script>)',
    '[bấm](file:///etc/passwd)',
    '[bấm](vbscript:msgbox)',
    '[bấm](//evil.example/x)',
    '[bấm](../NOTICE)',
    '![ảnh](https://evil.example/track.png)',
    '<javascript:alert(1)>',
    '[x](https://ok.example/"onmouseover="alert(1))',
    '`<script>`',
    '```\n<script>alert(1)</script>\n```',
    '# <script>alert(1)</script>',
    '- <iframe src="https://evil.example"></iframe>',
    '| a | b |\n|---|---|\n| <script> | [x](javascript:1) |',
    '> <style>body{display:none}</style>',
    '**<b>đậm</b>**',
    '\uE0000\uE001 giả placeholder \uE000',
    '<!-- x --> <script>alert(1)</script>',
  ];

  for (const src of evil) {
    it(`escape: ${JSON.stringify(src).slice(0, 60)}`, () => {
      const html = renderMarkdown(src);
      assertOnlySafeTags(html);
      // Chữ "javascript:" đã escape thì vô hại; cái bị cấm là thẻ thật và href không phải http(s)/#.
      expect(html).not.toMatch(/<script|<img|<iframe|<style|href="(?!https?:|#)/i);
    });
  }

  it('HTML thô hiện ra như chữ', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('liên kết javascript: chỉ còn chữ', () => {
    expect(renderMarkdown('[bấm](javascript:alert(1))')).toBe('<p>bấm</p>');
  });

  it('ảnh chỉ còn chữ alt, không tải gì', () => {
    expect(renderMarkdown('![sơ đồ](https://x.example/a.png)')).toBe('<p>sơ đồ</p>');
  });

  it('dấu ngoặc kép trong URL không thoát được thuộc tính href', () => {
    const html = renderMarkdown('[x](https://ok.example/a"b)');
    expect(html).toBe('<p><a href="https://ok.example/a%22b">x</a></p>');
  });
});

describe('safeHref', () => {
  it('chỉ http(s) tuyệt đối và neo', () => {
    expect(safeHref('https://github.com/a')).toBe('https://github.com/a');
    expect(safeHref('HTTP://x.example')).toBe('http://x.example/');
    expect(safeHref('#muc-1')).toBe('#muc-1');
    for (const bad of ['javascript:1', 'mailto:a@b.c', 'file:///x', '/abs', 'rel', '//x.example', 'data:,x', '']) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe('renderMarkdown — cú pháp', () => {
  it('tiêu đề có id, bỏ dãy # đóng', () => {
    expect(renderMarkdown('# Quyền riêng tư\n\n## Dữ liệu gửi đi ##')).toBe(
      '<h1 id="quyền-riêng-tư">Quyền riêng tư</h1>\n<h2 id="dữ-liệu-gửi-đi">Dữ liệu gửi đi</h2>',
    );
  });

  it('id trùng được đánh số', () => {
    expect(renderMarkdown('## MIT\n\n## MIT')).toBe('<h2 id="mit">MIT</h2>\n<h2 id="mit-1">MIT</h2>');
  });

  it('#hashtag không phải tiêu đề', () => {
    expect(renderMarkdown('#hashtag')).toBe('<p>#hashtag</p>');
  });

  it('tiêu đề setext', () => {
    expect(renderMarkdown('Tiêu đề\n===\n\nPhụ\n---')).toBe('<h1 id="tiêu-đề">Tiêu đề</h1>\n<h2 id="phụ">Phụ</h2>');
  });

  it('đoạn văn gộp dòng, dòng trống tách đoạn', () => {
    expect(renderMarkdown('một\nhai\n\nba')).toBe('<p>một\nhai</p>\n<p>ba</p>');
  });

  it('đậm, nghiêng, code, gạch', () => {
    expect(renderInline('**đậm** *nghiêng* _nghiêng_ __đậm__ `a*b*c` ~~bỏ~~')).toBe(
      '<strong>đậm</strong> <em>nghiêng</em> <em>nghiêng</em> <strong>đậm</strong> <code>a*b*c</code> <del>bỏ</del>',
    );
  });

  it('snake_case và 2 * 3 * 4 không thành nghiêng', () => {
    expect(renderInline('some_var_name và 2 * 3 * 4')).toBe('some_var_name và 2 * 3 * 4');
  });

  it('ngắt dòng cứng', () => {
    expect(renderMarkdown('một  \nhai\\\nba')).toBe('<p>một<br>\nhai<br>\nba</p>');
  });

  it('ký tự thoát', () => {
    expect(renderInline('\\*không nghiêng\\*')).toBe('*không nghiêng*');
  });

  it('liên kết, autolink, URL trần', () => {
    expect(renderInline('[GitHub](https://github.com/a "tiêu đề")')).toBe('<a href="https://github.com/a">GitHub</a>');
    expect(renderInline('<https://x.example/a>')).toBe('<a href="https://x.example/a">https://x.example/a</a>');
    expect(renderInline('xem https://x.example/a.')).toBe('xem <a href="https://x.example/a">https://x.example/a</a>.');
    expect(renderInline('(https://x.example/a)')).toBe('(<a href="https://x.example/a">https://x.example/a</a>)');
    expect(renderInline('[w](https://en.wikipedia.org/wiki/A_(b))')).toBe(
      '<a href="https://en.wikipedia.org/wiki/A_(b)">w</a>',
    );
  });

  it('chữ của liên kết không chứa liên kết lồng', () => {
    expect(renderInline('[xem https://a.example](https://b.example)')).toBe(
      '<a href="https://b.example/">xem https://a.example</a>',
    );
  });

  it('danh sách chặt, lỏng, lồng, có số', () => {
    expect(renderMarkdown('- a\n- b')).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>');
    expect(renderMarkdown('- a\n\n- b')).toBe('<ul>\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>');
    expect(renderMarkdown('- a\n  - a1\n  - a2\n- b')).toBe(
      '<ul>\n<li>a\n<ul>\n<li>a1</li>\n<li>a2</li>\n</ul></li>\n<li>b</li>\n</ul>',
    );
    expect(renderMarkdown('3. ba\n4. bốn')).toBe('<ol start="3">\n<li>ba</li>\n<li>bốn</li>\n</ol>');
  });

  it('mục danh sách có hai đoạn không bị gộp sai thẻ', () => {
    const html = renderMarkdown('- a\n\n  tiếp\n- b');
    expect(html).toContain('<li><p>a</p>\n<p>tiếp</p></li>');
  });

  it('khối code giữ nguyên, escape', () => {
    expect(renderMarkdown('```go\nif a < b && c {\n```')).toBe('<pre><code>if a &lt; b &amp;&amp; c {</code></pre>');
    expect(renderMarkdown('~~~\nx\n~~~')).toBe('<pre><code>x</code></pre>');
  });

  it('bảng có căn lề', () => {
    expect(renderMarkdown('| Gói | Giấy phép |\n|:---|---:|\n| a | MIT |')).toBe(
      '<div class="table"><table><thead><tr><th style="text-align:left">Gói</th><th style="text-align:right">Giấy phép</th></tr></thead>' +
        '<tbody><tr><td style="text-align:left">a</td><td style="text-align:right">MIT</td></tr></tbody></table></div>',
    );
  });

  it('trích dẫn và đường kẻ', () => {
    expect(renderMarkdown('> chú ý\n\n---')).toBe('<blockquote><p>chú ý</p></blockquote>\n<hr>');
  });

  it('bỏ dòng dấu phiên bản và chú thích nhiều dòng', () => {
    expect(renderMarkdown('<!-- legal-version: 3 -->\n# A\n<!--\nẩn\n-->\nb')).toBe('<h1 id="a">A</h1>\n<p>b</p>');
  });

  it('CRLF', () => {
    expect(renderMarkdown('# A\r\n\r\nb\r\n')).toBe('<h1 id="a">A</h1>\n<p>b</p>');
  });
});

describe('renderMarkdown — hiệu năng', () => {
  it('tài liệu ~1 MB render dưới 1 giây', () => {
    const block = [
      '## gopkg.example/pkg v1.2.3',
      '',
      'License: **MIT** — https://github.com/example/pkg',
      '',
      '```',
      'Permission is hereby granted, free of charge, to any person obtaining a copy',
      '```',
      '',
      '- item one with `code` and [link](https://x.example)',
      '- item two',
      '',
    ].join('\n');
    const src = block.repeat(Math.ceil(1_000_000 / block.length));
    const t0 = performance.now();
    const html = renderMarkdown(src);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(html.length).toBeGreaterThan(src.length);
  });

  it('chuỗi bệnh lý không làm treo', () => {
    const t0 = performance.now();
    renderMarkdown('*'.repeat(50_000) + '\n' + '_a'.repeat(50_000) + '\n' + '['.repeat(20_000) + '\n#' + ' '.repeat(50_000) + 'x' + '\na' + ' '.repeat(50_000) + 'b');
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('slugify', () => {
  it('giữ chữ có dấu, bỏ dấu câu', () => {
    expect(slugify('Điều 3. Dữ liệu (API key)')).toBe('điều-3-dữ-liệu-api-key');
  });
});
