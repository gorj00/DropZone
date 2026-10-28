import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { ImageLabeling } from '@capacitor-mlkit/image-labeling';
import { PoseDetection, PoseLandmark, PoseLandmarkType } from '@capacitor-mlkit/pose-detection';
import { TextRecognition } from '@capacitor-mlkit/text-recognition';
import { environment } from '../../../environments/environment';
import { Exercise } from '../api/models';
import { GrayImage, readSevenSegment } from './seven-segment';

export type { Exercise } from '../api/models';

export interface PhotoAnalysis {
  labels: string[];
  text: string | null;
  number: number | null;
}

const MISREADS: Record<string, string> = {
  O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', '|': '1', '!': '1', Z: '2', z: '2',
  S: '5', s: '5', B: '8', G: '6', b: '6', g: '9', q: '9'
};

export type ScaleUnit = 'kg' | 'lb';

export interface ScaleCrop {
  gray: GrayImage;
  dataUrl: string;
}

const RANGES: Record<ScaleUnit, [number, number]> = { kg: [20, 350], lb: [44, 772] };

const CAPACITIES = new Set(['120', '130', '136', '150', '160', '180', '181', '200', '220', '250', '300', '330', '350', '396', '400', '440', '500', '550']);

const LABEL_LINE = /\b(max|min|cap|capacity|limit)\b|\bm[aä][a-z]?\s*[:.]?\s*\d|\b[de]\s*=/i;

function numericTokens(text: string): string[] {
  const raw = text.replace(/(\d)\s*,\s*(\d)/g, '$1.$2').split(/\s+/).map(t => t.replace(/(kgs?|lbs?)$/i, '')).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const next = raw[i + 1];
    if (next && ((raw[i].endsWith('.') && /^[\dOoDQIlZzSsBGbgq]{1,2}$/.test(next)) || (next.startsWith('.') && next.length <= 3))) {
      out.push(raw[i] + next);
      i++;
    } else {
      out.push(raw[i]);
    }
  }
  return out.filter(t => /\d/.test(t)).map(t => [...t].map(c => MISREADS[c] ?? c).join(''));
}

export function weightCandidates(text: string | null | undefined, unit: ScaleUnit = 'kg'): { value: number; rank: number }[] {
  if (!text) return [];
  const [min, max] = RANGES[unit];
  const inRange = (v: number) => v >= min && v <= max;
  const out: { value: number; rank: number }[] = [];
  const lines = text.split(/\n+/).filter(line => !LABEL_LINE.test(line));
  for (const token of lines.flatMap(numericTokens).filter(t => !CAPACITIES.has(t.replace(/\D/g, '')) || t.includes('.'))) {
    for (const [s] of token.matchAll(/\d+(?:\.\d+)?/g)) {
      if (s.includes('.')) {
        const v = parseFloat(s);
        if (inRange(v)) out.push({ value: v, rank: 0 });
        continue;
      }
      const n = parseInt(s, 10);
      if (s.length <= 3 && inRange(n)) out.push({ value: n, rank: 1 });
      if (s.length >= 3 && inRange(n / 10)) out.push({ value: n / 10, rank: inRange(n) ? 3 : 2 });
    }
  }
  return out;
}

export function parseWeight(text: string | null | undefined, expected?: number | null, unit: ScaleUnit = 'kg'): number | null {
  const candidates = weightCandidates(text, unit);
  if (!candidates.length) return null;
  const score = (c: { value: number; rank: number }) =>
    expected ? Math.abs(c.value - expected) * 10 + c.rank : c.rank;
  return candidates.reduce((best, c) => (score(c) < score(best) ? c : best)).value;
}

export function angle(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const ab = Math.atan2(a.y - b.y, a.x - b.x);
  const cb = Math.atan2(c.y - b.y, c.x - b.x);
  let deg = Math.abs((ab - cb) * 180 / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

const JOINTS: Record<Exercise, { down: number; up: number; left: PoseLandmarkType[]; right: PoseLandmarkType[] }> = {
  SQUAT: { down: 100, up: 160, left: [PoseLandmarkType.LeftHip, PoseLandmarkType.LeftKnee, PoseLandmarkType.LeftAnkle], right: [PoseLandmarkType.RightHip, PoseLandmarkType.RightKnee, PoseLandmarkType.RightAnkle] },
  PUSHUP: { down: 95, up: 155, left: [PoseLandmarkType.LeftShoulder, PoseLandmarkType.LeftElbow, PoseLandmarkType.LeftWrist], right: [PoseLandmarkType.RightShoulder, PoseLandmarkType.RightElbow, PoseLandmarkType.RightWrist] }
};

export class RepCounter {
  count = 0;
  private down = false;

  constructor(private readonly exercise: Exercise) { }

  feed(landmarks: { type: string; x: number; y: number; inFrameLikelihood: number }[]): number {
    const cfg = JOINTS[this.exercise];
    const pick = (types: string[]) => types.map(t => landmarks.find(l => l.type === t));
    const sides = [pick(cfg.left), pick(cfg.right)]
      .filter(s => s.every(p => p && p.inFrameLikelihood > 0.5)) as { x: number; y: number; inFrameLikelihood: number }[][];
    if (!sides.length) return this.count;
    const best = sides.sort((a, b) => b.reduce((s, p) => s + p.inFrameLikelihood, 0) - a.reduce((s, p) => s + p.inFrameLikelihood, 0))[0];
    const deg = angle(best[0], best[1], best[2]);
    if (!this.down && deg < cfg.down) this.down = true;
    else if (this.down && deg > cfg.up) {
      this.down = false;
      this.count++;
    }
    return this.count;
  }
}

async function centerCrop(dataUrl: string, frac = 0.6, scale = 2): Promise<string | null> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const sw = img.naturalWidth * frac;
  const sh = img.naturalHeight * frac;
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'grayscale(1) contrast(1.6)';
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}

@Injectable({ providedIn: 'root' })
export class VisionService {
  readonly available = Capacitor.isNativePlatform();

  async writeTemp(dataUrl: string, name = `frame-${Date.now()}.jpg`): Promise<string> {
    const data = dataUrl.substring(dataUrl.indexOf(',') + 1);
    const res = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    return res.uri;
  }

  async deleteTemp(name: string): Promise<void> {
    try { await Filesystem.deleteFile({ path: name, directory: Directory.Cache }); } catch { }
  }

  async analyzeScale(dataUrl: string, crops: ScaleCrop[], expected?: number | null, unit: ScaleUnit = 'kg'): Promise<PhotoAnalysis> {
    const readings = crops.map(c => readSevenSegment(c.gray));
    const fromSegments = readings.map(r => (r ? parseWeight(r.text, expected, unit) : null)).find(v => v !== null) ?? null;
    const segmentText = readings.find(r => r)?.text ?? null;
    const debug = (extra: Record<string, unknown>) => {
      if (!environment.production) {
        (window as unknown as { __dzScale?: unknown }).__dzScale = { readings, fromSegments, expected, unit, crops: crops.map(c => c.dataUrl), ...extra };
      }
    };
    if (!this.available) {
      debug({ number: fromSegments });
      return { labels: [], text: segmentText, number: fromSegments };
    }
    const stamp = Date.now();
    const name = `proof-${stamp}.jpg`;
    const cropName = `proof-${stamp}-display.jpg`;
    const path = await this.writeTemp(dataUrl, name);
    const cropPath = crops[0] ? await this.writeTemp(crops[0].dataUrl, cropName) : null;
    const read = (p: string) => TextRecognition.processImage({ path: p }).then(r => r.text).catch(() => '');
    try {
      const [labels, texts] = await Promise.all([
        ImageLabeling.processImage({ path }).then(r => r.labels.filter(l => l.confidence >= 0.6).map(l => l.text)).catch(() => [] as string[]),
        Promise.all([cropPath ? read(cropPath) : Promise.resolve(''), read(path)])
      ]);
      const ocr = texts.filter(Boolean).join('\n');
      const text = [segmentText, ocr].filter(Boolean).join('\n') || null;
      const number = fromSegments ?? parseWeight(ocr, expected, unit);
      debug({ ocr: texts, number });
      return { labels, text, number };
    } finally {
      await this.deleteTemp(name);
      if (cropPath) await this.deleteTemp(cropName);
    }
  }

  async analyzePhoto(dataUrl: string, readNumber: boolean, expected?: number | null, unit: ScaleUnit = 'kg'): Promise<PhotoAnalysis> {
    if (!this.available) return { labels: [], text: null, number: null };
    const stamp = Date.now();
    const name = `proof-${stamp}.jpg`;
    const cropName = `proof-${stamp}-crop.jpg`;
    const path = await this.writeTemp(dataUrl, name);
    const crop = readNumber ? await centerCrop(dataUrl).catch(() => null) : null;
    const cropPath = crop ? await this.writeTemp(crop, cropName) : null;
    const read = (p: string) => TextRecognition.processImage({ path: p }).then(r => r.text).catch(() => '');
    try {
      const [labels, texts] = await Promise.all([
        ImageLabeling.processImage({ path }).then(r => r.labels.filter(l => l.confidence >= 0.6).map(l => l.text)).catch(() => [] as string[]),
        readNumber ? Promise.all([cropPath ? read(cropPath) : Promise.resolve(''), read(path)]) : Promise.resolve([])
      ]);
      const text = texts.filter(Boolean).join('\n') || null;
      return { labels, text, number: parseWeight(text, expected, unit) };
    } finally {
      await this.deleteTemp(name);
      if (cropPath) await this.deleteTemp(cropName);
    }
  }

  async pose(dataUrl: string): Promise<PoseLandmark[]> {
    if (!this.available) return [];
    const name = 'pose-frame.jpg';
    const path = await this.writeTemp(dataUrl, name);
    const r = await PoseDetection.processImage({ path });
    return r.poses[0]?.landmarks ?? [];
  }
}
