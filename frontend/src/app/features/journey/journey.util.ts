import { Checkpoint, Goal } from '../../core/api/models';
import { METRIC_UNITS, Units, displayUnit, formatValue } from '../../core/units';

export function sign(goal: Goal): string {
  return goal.path === 'LOSE' ? '−' : '+';
}

export function delta(goal: Goal, value: number, units: Units = METRIC_UNITS): string {
  return `${sign(goal)}${formatValue(value, goal.unit, units)} ${displayUnit(goal.unit, units)}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function cpTitle(cp: Checkpoint): string {
  return cp.rewardTitle?.trim() || `Milestone ${pad(cp.index)}`;
}

export function rewardName(cp: Checkpoint): string | null {
  return cp.rewardTitle?.trim() || null;
}

export function rewardLabel(cp: Checkpoint): string {
  return rewardName(cp) ?? `Milestone ${pad(cp.index)} reward`;
}

export function toGo(goal: Goal, cp: Checkpoint): number {
  return Math.max(0, Math.round((cp.deltaToEarn - goal.progressValue) * 10) / 10);
}

export function targetLabel(goal: Goal): string {
  if (goal.metric === 'STRENGTH') return 'target lift';
  if (goal.metric === 'SIZE') return 'target size';
  return 'target weight';
}

export function verb(goal: Goal): string {
  return goal.path === 'LOSE' ? 'dropped' : 'gained';
}

export function shortDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function longDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export async function shrinkImage(file: File, max = 1600, quality = 0.85): Promise<Blob> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('This photo format is not supported.'));
      i.src = src;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 4_000_000 && /image\/(jpe?g|png)/.test(file.type)) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read the photo.'))), 'image/jpeg', quality)
    );
  } finally {
    URL.revokeObjectURL(src);
  }
}
