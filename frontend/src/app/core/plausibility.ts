import { Metric, Path } from './api/models';
import { KG_PER_LB, CM_PER_IN, Units, displayUnit, toDisplay } from './units';

export const METRIC_BOUNDS: Record<Metric, { min: number; max: number }> = {
  WEIGHT: { min: 20, max: 350 },
  STRENGTH: { min: 1, max: 500 },
  SIZE: { min: 5, max: 250 }
};

export const MIN_GAP: Record<Metric, number> = { WEIGHT: 0.2, STRENGTH: 0.2, SIZE: 0.5 };

export const BIG_JUMP = { kg: 15, share: 0.2 };

export function metricUnit(metric: Metric): 'kg' | 'cm' {
  return metric === 'SIZE' ? 'cm' : 'kg';
}

export function displayBounds(metric: Metric, units: Units, digits = 1): { min: number; max: number } {
  const f = 10 ** digits;
  const unit = metricUnit(metric);
  const b = METRIC_BOUNDS[metric];
  return { min: Math.ceil(toDisplay(b.min, unit, units) * f - 1e-6) / f, max: Math.floor(toDisplay(b.max, unit, units) * f + 1e-6) / f };
}

export function rangeText(metric: Metric, units: Units, digits = 1): string {
  const d = displayBounds(metric, units, digits);
  return `${d.min}–${d.max} ${displayUnit(metricUnit(metric), units)}`;
}

export function inBounds(metric: Metric, value: number): boolean {
  const b = METRIC_BOUNDS[metric];
  return Number.isFinite(value) && value >= b.min - 1e-6 && value <= b.max + 1e-6;
}

export function boundsError(metric: Metric, value: number, units: Units, label: string): string | null {
  if (inBounds(metric, value)) return null;
  const d = displayBounds(metric, units);
  return `${label} must be between ${d.min} and ${d.max} ${displayUnit(metricUnit(metric), units)}.`;
}

export function isBigJump(current: number | null | undefined, value: number, unit: 'kg' | 'cm'): boolean {
  if (current === null || current === undefined || !(current > 0)) return false;
  const limit = Math.max(unit === 'kg' ? BIG_JUMP.kg : 0, current * BIG_JUMP.share);
  return Math.abs(value - current) > limit + 1e-9;
}

export function proofTolerance(unit: 'kg' | 'cm', units: Units): number {
  if (unit === 'cm') return units.length === 'IN' ? 0.05 * CM_PER_IN : 0.05;
  return units.weight === 'LB' ? 0.05 * KG_PER_LB : 0.05;
}

export function spreadTargets(from: number, to: number, count: number): number[] {
  const step = (to - from) / count;
  const targets: number[] = [];
  for (let i = 1; i < count; i++) targets.push(Math.round((from + step * i) * 10) / 10);
  targets.push(to);
  return targets;
}

export function spacedTargets(from: number, targets: number[], minGap: number): boolean {
  const direction = Math.sign(targets[targets.length - 1] - from);
  const need = minGap > 0 ? minGap - 1e-6 : 1e-6;
  let previous = from;
  for (const t of targets) {
    if ((t - previous) * direction < need) return false;
    previous = t;
  }
  return direction !== 0;
}

export function milestonesFit(from: number, to: number, count: number, minGap: number): boolean {
  return count >= 1 && spacedTargets(from, spreadTargets(from, to, count), minGap);
}

export function reachesTarget(path: Path, value: number, target: number, tolerance: number): boolean {
  return path === 'LOSE' ? value <= target + tolerance + 1e-9 : value >= target - tolerance - 1e-9;
}
