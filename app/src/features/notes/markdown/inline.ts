import { esc, MATH_OPEN } from './math';

export function inline(text: string): string {
  return text
    .split(/(`[^`]+`)/g)
    .map((part, i) => {
      if (i % 2) return `<code>${esc(part.slice(1, -1))}</code>`;
      let t = esc(part);
      t = t.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (all, label, url) =>
          url.includes(MATH_OPEN)
            ? all
            : `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
      );
      t = t
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?![\w*])/g, '$1<em>$2</em>');
      t = t.replace(/(^|[^\w_])_([^_\s][^_]*?)_(?![\w_])/g, '$1<em>$2</em>');
      return t;
    })
    .join('');
}
