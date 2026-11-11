import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detox } from './detox';
import { extractMath, renderMath, restoreMath } from './math';
import { renderCodeBlock, highlightCode } from './codeBlock';
import { inline } from './inline';
import { renderMarkdown } from './parser';

describe('Markdown Engine', () => {
  describe('detox', () => {
    it('removes <think>...</think> reasoning blocks', () => {
      const input = '<think>Menganalisis rumus fisika...</think># Rumus Kecepatan\n$v = s / t$';
      expect(detox(input)).toBe('# Rumus Kecepatan\n$v = s / t$');
    });

    it('unwraps outer markdown fences', () => {
      const input = '```markdown\n# Judul Catatan\nIsi materi\n```';
      expect(detox(input)).toBe('# Judul Catatan\nIsi materi');
    });

    it('extracts content from single-field JSON payload', () => {
      const input = '{"content": "# Catatan dari JSON\\nIsi teks"}';
      expect(detox(input)).toBe('# Catatan dari JSON\nIsi teks');
    });

    it('unescapes literal newlines outside code fences', () => {
      const input = 'Baris pertama\\nBaris kedua\\nBaris ketiga';
      expect(detox(input)).toBe('Baris pertama\nBaris kedua\nBaris ketiga');
    });
  });

  describe('math extraction & KaTeX rendering', () => {
    beforeEach(() => {
      delete (window as any).katex;
    });

    it('extracts display math and inline math into private tokens', () => {
      const src = 'Luas lingkaran adalah $A = \\pi r^2$. Rumus kuadrat:\n$$ax^2 + bx + c = 0$$';
      const [text, math] = extractMath(src);
      expect(math.length).toBe(2);
      expect(math[0]?.display).toBe(false);
      expect(math[0]?.tex).toBe('A = \\pi r^2');
      expect(math[1]?.display).toBe(true);
      expect(math[1]?.tex).toBe('ax^2 + bx + c = 0');
      expect(text).toContain('\uE0000\uE001');
      expect(text).toContain('\uE0001\uE001');
    });

    it('falls back to code.math-fallback when window.katex is absent', () => {
      const m = { tex: 'E = mc^2', display: false };
      const html = renderMath(m);
      expect(html).toBe('<code class="math-fallback">$E = mc^2$</code>');
    });

    it('renders via window.katex when available', () => {
      (window as any).katex = {
        renderToString: vi.fn((tex) => `<span class="katex-rendered">${tex}</span>`),
      };

      const m = { tex: '\\int x dx', display: true };
      const html = renderMath(m);
      expect(html).toBe('<span class="katex-rendered">\\int x dx</span>');
    });
  });

  describe('code block syntax highlighter', () => {
    it('generates figure with language badge, line count, and copy button', () => {
      const code = 'def hello():\n    print("world")';
      const rendered = renderCodeBlock('python', code);

      expect(rendered).toContain('data-lang="python"');
      expect(rendered).toContain('2 baris');
      expect(rendered).toContain('data-action="copy"');
      expect(rendered).toContain('class="code-canvas"');
    });

    it('highlights python keywords and builtins', () => {
      const html = highlightCode('def greet():\n    print("halo")', 'python');
      expect(html).toContain('token-keyword');
      expect(html).toContain('token-builtin');
      expect(html).toContain('token-string');
    });
  });

  describe('inline formatting and XSS protection', () => {
    it('escapes raw HTML script tags preventing XSS', () => {
      const malicious = '<script>alert("xss")</script> **tebal**';
      const result = inline(malicious);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('<strong>tebal</strong>');
    });

    it('formats bold, italics, inline code, and external links', () => {
      const text = '**bold** _italic_ `code` [Belajar](https://example.com)';
      const result = inline(text);
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
      expect(result).toContain('<code>code</code>');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('target="_blank"');
    });
  });

  describe('full renderMarkdown pipeline', () => {
    it('renders headings with deterministic bagian-N ids on h2', () => {
      const md = '# Bab 1\n## Bagian Pertama\nIsi paragraf.\n## Bagian Kedua\nIsi lainnya.';
      const html = renderMarkdown(md);

      expect(html).toContain('<h1>Bab 1</h1>');
      expect(html).toContain('<h2 id="bagian-0">Bagian Pertama</h2>');
      expect(html).toContain('<h2 id="bagian-1">Bagian Kedua</h2>');
    });

    it('renders pipe tables with alignment', () => {
      const tableMd = '| Parameter | Nilai |\n|:---|---:|\n| Waktu | 10 detik |\n| Suhu | 25 C |';
      const html = renderMarkdown(tableMd);

      expect(html).toContain('<div class="tw"><table>');
      expect(html).toContain('<th>Parameter</th>');
      expect(html).toContain('<td>Waktu</td>');
      expect(html).toContain('<td style="text-align:right">10 detik</td>');
    });

    it('renders task lists with checkbox glyphs', () => {
      const listMd = '- [ ] Belajar kalkulus\n- [x] Latihan soal integral';
      const html = renderMarkdown(listMd);

      expect(html).toContain('☐ Belajar kalkulus');
      expect(html).toContain('☑ Latihan soal integral');
    });
  });
});
