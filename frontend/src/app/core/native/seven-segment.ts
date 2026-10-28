export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface SegmentReading {
  text: string;
  digits: number;
  decimal: boolean;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
  id: number;
  members?: number[];
}

const DIGITS: Record<string, string> = {
  '1111110': '0',
  '0110000': '1',
  '1101101': '2',
  '1111001': '3',
  '0110011': '4',
  '1011011': '5',
  '1011111': '6',
  '1110000': '7',
  '1110010': '7',
  '1111111': '8',
  '1111011': '9',
  '1110011': '9'
};

export function otsu(values: ArrayLike<number>): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < values.length; i++) hist[values[i]]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

function components(mask: Uint8Array, w: number, h: number, minArea: number, labels?: Int32Array): Box[] {
  const seen = new Uint8Array(w * h);
  const pixels: number[] = [];
  const stack = new Int32Array(w * h);
  const out: Box[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const box: Box = { x0: w, y0: h, x1: -1, y1: -1, area: 0, id: out.length + 1 };
    pixels.length = 0;
    while (top) {
      const p = stack[--top];
      pixels.push(p);
      const x = p % w;
      const y = (p - x) / w;
      box.area++;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (mask[q] && !seen[q]) {
            seen[q] = 1;
            stack[top++] = q;
          }
        }
      }
    }
    if (box.area >= minArea) {
      if (labels) for (const p of pixels) labels[p] = box.id;
      out.push(box);
    }
  }
  return out;
}

function crop(img: GrayImage, b: { x0: number; y0: number; x1: number; y1: number }): GrayImage {
  const width = b.x1 - b.x0 + 1;
  const height = b.y1 - b.y0 + 1;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = img.data[(b.y0 + y) * img.width + b.x0 + x];
  }
  return { width, height, data };
}

function darkMask(img: GrayImage): Uint8Array {
  const t = otsu(img.data);
  const mask = new Uint8Array(img.width * img.height);
  for (let i = 0; i < mask.length; i++) mask[i] = img.data[i] <= t ? 1 : 0;
  return mask;
}

function localMask(img: GrayImage, offset: number): Uint8Array {
  const { width: w, height: h, data } = img;
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(7, Math.round(Math.min(w, h) / 5));
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const area = (y1 - y0) * (x1 - x0);
      const total = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
      mask[y * w + x] = data[y * w + x] < total / area - offset ? 1 : 0;
    }
  }
  return mask;
}

function findPanel(img: GrayImage): GrayImage {
  const mask = darkMask(img);
  const comps = components(mask, img.width, img.height, (img.width * img.height) / 50);
  const panel = comps
    .map(c => ({ c, w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1 }))
    .filter(({ c, w, h }) => c.area / (w * h) > 0.55 && w > h * 1.2 && w < h * 4 && w * h > img.width * img.height * 0.05 && c.x0 > 1 && c.y0 > 1 && c.x1 < img.width - 2 && c.y1 < img.height - 2)
    .sort((a, b) => b.c.area - a.c.area)[0];
  if (!panel) return img;
  const ix = Math.round(panel.w * 0.01);
  const iy = Math.round(panel.h * 0.01);
  return crop(img, { x0: panel.c.x0 + ix, y0: panel.c.y0 + iy, x1: panel.c.x1 - ix, y1: panel.c.y1 - iy });
}

function probe(mask: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, thick: number): boolean {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const vertical = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  let hits = 0;
  for (let i = 0; i <= steps; i++) {
    const cx = Math.round(x0 + ((x1 - x0) * i) / steps);
    const cy = Math.round(y0 + ((y1 - y0) * i) / steps);
    let dark = 0;
    let all = 0;
    for (let t = -thick; t <= thick; t++) {
      const x = vertical ? cx + t : cx;
      const y = vertical ? cy : cy + t;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      all++;
      dark += mask[y * w + x];
    }
    if (all && dark / all > 0.5) hits++;
  }
  return hits >= Math.max(2, steps * 0.06);
}

function segmentBits(mask: Uint8Array, w: number, h: number, b: { x0: number; y0: number; x1: number; y1: number }): string {
  const bw = b.x1 - b.x0 + 1;
  const bh = b.y1 - b.y0 + 1;
  const X = (f: number) => b.x0 + f * (bw - 1);
  const Y = (f: number) => b.y0 + f * (bh - 1);
  const t = Math.max(1, Math.round(bh * 0.01));
  const lines: [number, number, number, number][] = [
    [0.5, 0, 0.5, 0.2],
    [0.62, 0.27, 1, 0.27],
    [0.62, 0.73, 1, 0.73],
    [0.5, 0.8, 0.5, 1],
    [0, 0.73, 0.38, 0.73],
    [0, 0.27, 0.38, 0.27],
    [0.5, 0.38, 0.5, 0.62]
  ];
  return lines.map(([fx0, fy0, fx1, fy1]) => (probe(mask, w, h, X(fx0), Y(fy0), X(fx1), Y(fy1), t) ? '1' : '0')).join('');
}

function classify(strong: string, weak: string): string | null {
  if (DIGITS[strong]) return DIGITS[strong];
  const extra = [...weak].map((c, i) => (c === '1' && strong[i] === '0' ? i : -1)).filter(i => i >= 0);
  for (let size = 1; size <= extra.length; size++) {
    const found = new Set<string>();
    for (let mask = 0; mask < 1 << extra.length; mask++) {
      const picked = extra.filter((_, j) => mask & (1 << j));
      if (picked.length !== size) continue;
      const bits = [...strong].map((c, i) => (picked.includes(i) ? '1' : c)).join('');
      if (DIGITS[bits]) found.add(DIGITS[bits]);
    }
    if (found.size === 1) return [...found][0];
    if (found.size > 1) return null;
  }
  return null;
}

export function readSevenSegment(source: GrayImage): SegmentReading | null {
  const img = findPanel(source);
  const { width: w, height: h } = img;
  const mask = localMask(img, 14);
  const faint = localMask(img, 6);
  const bx = Math.round(w * 0.03);
  const by = Math.round(h * 0.03);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (x < bx || x >= w - bx || y < by || y >= h - by) mask[y * w + x] = 0;
  }
  const labels = new Int32Array(w * h);
  const comps = components(mask, w, h, Math.max(4, (w * h) / 6000), labels);
  if (!comps.length) return null;

  const tall = Math.max(...comps.map(c => c.y1 - c.y0 + 1));
  const isBig = (c: Box) => c.y1 - c.y0 + 1 >= tall * 0.17 || c.x1 - c.x0 + 1 >= tall * 0.17;
  const gapTol = Math.max(2, tall * 0.02);
  const flat = (c: Box) => c.x1 - c.x0 > c.y1 - c.y0;
  const groups: (Box & { rightFlat: boolean })[] = [];
  for (const c of comps.filter(isBig).sort((a, b) => a.x0 - b.x0)) {
    const g = groups.find(g => {
      const overlap = Math.min(g.x1, c.x1) - Math.max(g.x0, c.x0);
      return overlap > Math.min(g.x1 - g.x0, c.x1 - c.x0) * 0.3 || ((flat(c) || g.rightFlat) && overlap > -gapTol);
    });
    if (g) {
      if (c.x1 >= g.x1) g.rightFlat = flat(c);
      g.x0 = Math.min(g.x0, c.x0);
      g.x1 = Math.max(g.x1, c.x1);
      g.y0 = Math.min(g.y0, c.y0);
      g.y1 = Math.max(g.y1, c.y1);
      g.area += c.area;
      g.members!.push(c.id);
    } else groups.push({ ...c, members: [c.id], rightFlat: flat(c) });
  }

  const byId = new Map(comps.map(c => [c.id, c]));
  for (const g of groups) {
    const parts = g.members!.map(id => byId.get(id)!);
    const verticals = parts.filter(p => !flat(p));
    if (!verticals.length) continue;
    const vx0 = Math.min(...verticals.map(p => p.x0)) - gapTol;
    const vx1 = Math.max(...verticals.map(p => p.x1)) + gapTol;
    const kept = parts.filter(p => !flat(p) || ((p.x0 + p.x1) / 2 >= vx0 && (p.x0 + p.x1) / 2 <= vx1));
    g.members = kept.map(p => p.id);
    g.x0 = Math.min(...kept.map(p => p.x0));
    g.x1 = Math.max(...kept.map(p => p.x1));
    g.y0 = Math.min(...kept.map(p => p.y0));
    g.y1 = Math.max(...kept.map(p => p.y1));
    g.area = kept.reduce((a, p) => a + p.area, 0);
  }

  const digitHeight = Math.max(...groups.map(g => g.y1 - g.y0 + 1));
  const digits = groups
    .filter(g => g.y1 - g.y0 + 1 >= digitHeight * 0.7 && g.x1 - g.x0 + 1 < w * 0.5)
    .sort((a, b) => a.x0 - b.x0);
  if (!digits.length || digits.length > 5) return null;
  const top = Math.min(...digits.map(d => d.y0));
  const bottom = Math.max(...digits.map(d => d.y1));
  const width = Math.max(...digits.map(d => d.x1 - d.x0 + 1));

  const dot = comps
    .filter(c => !isBig(c))
    .filter(c => {
      const cw = c.x1 - c.x0 + 1;
      const ch = c.y1 - c.y0 + 1;
      const size = Math.max(cw, ch);
      return c.area / (cw * ch) >= 0.45 && cw / ch > 0.5 && cw / ch < 2 && size >= digitHeight * 0.04 && size <= digitHeight * 0.16 && c.y1 >= bottom - digitHeight * 0.15;
    })
    .filter(c => {
      const cx = (c.x0 + c.x1) / 2;
      return digits.some((d, i) => i < digits.length - 1 && cx > (d.x0 + d.x1) / 2 && cx < (digits[i + 1].x0 + digits[i + 1].x1) / 2);
    })
    .sort((a, b) => b.area - a.area)[0];
  const dotX = dot ? (dot.x0 + dot.x1) / 2 : null;

  const own = new Uint8Array(w * h);
  let text = '';
  for (let i = 0; i < digits.length; i++) {
    const d = digits[i];
    const narrow = d.x1 - d.x0 + 1 < width * 0.6;
    let ch: string | null = '1';
    if (!narrow) {
      own.fill(0);
      const ids = new Set(d.members);
      for (let y = top; y <= bottom; y++) {
        for (let x = d.x0; x <= d.x1; x++) {
          const p = y * w + x;
          if (ids.has(labels[p])) own[p] = 1;
        }
      }
      const box = { x0: Math.max(0, Math.min(d.x0, d.x1 - width + 1)), y0: top, x1: d.x1, y1: bottom };
      ch = classify(segmentBits(own, w, h, box), segmentBits(faint, w, h, box));
    }
    if (ch === null) return null;
    text += ch;
    const next = digits[i + 1];
    if (dotX !== null && next && dotX > (d.x0 + d.x1) / 2 && dotX < (next.x0 + next.x1) / 2) text += '.';
  }
  return { text, digits: digits.length, decimal: dotX !== null };
}
