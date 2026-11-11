import type { GraphTheme } from './Graph';
import { Graph } from './Graph';
import { buildLayout, canvasMeasure } from './layout';
import type { MindMapData } from './types';
import React from 'react';

export interface ExportedSvg {
  text: string;
  width: number;
  height: number;
}

/**
 * Serialises the *fully expanded* map as a standalone SVG (explicit colours, white background).
 * `react-dom/server` is loaded lazily so it only costs bytes when the user actually exports.
 */
export async function buildSvg(data: MindMapData, theme: GraphTheme): Promise<ExportedSvg> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const layout = buildLayout(data.root, new Set(), canvasMeasure);
  const b = layout.bbox;
  const pad = 30;
  const width = Math.ceil(b.w + pad * 2);
  const height = Math.ceil(b.h + pad * 2);
  const graph = renderToStaticMarkup(
    React.createElement(Graph, {
      layout,
      relations: data.relations,
      theme,
      selected: null,
      showRelations: true,
      collapsed: new Set<string>(),
      interactive: false,
      textWidth: canvasMeasure,
    }),
  );
  const text =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Bricolage, system-ui, sans-serif">` +
    `<rect width="${width}" height="${height}" fill="${theme.surface}"/>` +
    `<g transform="translate(${pad - b.x} ${pad - b.y})">${graph}</g></svg>`;
  return { text, width, height };
}

export function exportFileName(data: MindMapData, ext: 'svg' | 'png'): string {
  const base = String(data.root.label).replace(/[^\w-]+/g, '_').slice(0, 40) || 'catatan';
  return `mindmap-${base}.${ext}`;
}

export function saveBlob(blob: Blob, name: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

export function svgToPng(svg: ExportedSvg, scale = 2): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = svg.width * scale;
        canvas.height = svg.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.text)}`;
  });
}
