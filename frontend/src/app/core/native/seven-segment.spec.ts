import { GrayImage, otsu, readSevenSegment } from './seven-segment';

const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg'
};

function display(text: string, opts: { hollow?: boolean; ghost?: boolean } = {}): GrayImage {
  const dh = 120;
  const dw = 60;
  const t = 12;
  const gap = 24;
  const pad = 30;
  const chars = [...text];
  const digits = chars.filter(c => c !== '.').length;
  const width = pad * 2 + digits * dw + (digits - 1) * gap;
  const height = dh + pad * 2;
  const data = new Uint8Array(width * height).fill(170);
  const rect = (x: number, y: number, w: number, h: number, v: number) => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const edge = xx < x + 2 || xx >= x + w - 2 || yy < y + 2 || yy >= y + h - 2;
        if (!opts.hollow || edge) data[yy * width + xx] = v;
      }
    }
  };
  let x = pad;
  for (const ch of chars) {
    if (ch === '.') {
      rect(x - gap / 2 - 5, pad + dh - 10, 10, 10, 30);
      continue;
    }
    const y = pad;
    const parts: Record<string, [number, number, number, number]> = {
      a: [x + t, y, dw - 2 * t, t],
      b: [x + dw - t, y + t, t, dh / 2 - t - 2],
      c: [x + dw - t, y + dh / 2 + 2, t, dh / 2 - t - 2],
      d: [x + t, y + dh - t, dw - 2 * t, t],
      e: [x, y + dh / 2 + 2, t, dh / 2 - t - 2],
      f: [x, y + t, t, dh / 2 - t - 2],
      g: [x + t, y + dh / 2 - t / 2, dw - 2 * t, t]
    };
    for (const [seg, r] of Object.entries(parts)) {
      if (SEGMENTS[ch].includes(seg)) rect(...r, 30);
      else if (opts.ghost) rect(...r, 150);
    }
    x += dw + gap;
  }
  return { width, height, data };
}

describe('readSevenSegment', () => {
  it('reads every digit', () => {
    expect(readSevenSegment(display('01234'))?.text).toBe('01234');
    expect(readSevenSegment(display('56789'))?.text).toBe('56789');
  });

  it('finds the decimal point', () => {
    const r = readSevenSegment(display('88.5'));
    expect(r?.text).toBe('88.5');
    expect(r?.decimal).toBe(true);
  });

  it('reads outlined segments', () => {
    expect(readSevenSegment(display('96.5', { hollow: true }))?.text).toBe('96.5');
  });

  it('ignores faint inactive segments', () => {
    expect(readSevenSegment(display('72.3', { ghost: true }))?.text).toBe('72.3');
  });

  it('returns null for an empty panel', () => {
    expect(readSevenSegment({ width: 200, height: 100, data: new Uint8Array(20000).fill(170) })).toBeNull();
  });
});

describe('otsu', () => {
  it('splits two tones', () => {
    const t = otsu([...new Array(50).fill(30), ...new Array(50).fill(200)]);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(200);
  });
});
