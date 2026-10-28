import { Checkpoint, Goal, Path, Verification } from '../../core/api/models';
import { MIN_GAP, milestonesFit } from '../../core/plausibility';

const EPS = 1e-9;

export function effectiveVerification(cp: Checkpoint, pro: boolean): Verification {
  return cp.verification === 'COMMUNITY' && !pro && cp.status !== 'PENDING_VERIFICATION' && cp.status !== 'CLEARED' ? 'AI' : cp.verification;
}

export function isDone(cp: Checkpoint): boolean {
  return cp.status === 'CLEARED' || cp.status === 'PENDING_VERIFICATION';
}

export function beyond(path: Path, value: number, reference: number): boolean {
  return path === 'LOSE' ? value < reference - EPS : value > reference + EPS;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function lastDone(goal: Goal): Checkpoint | null {
  return [...goal.checkpoints].sort((a, b) => a.index - b.index).filter(isDone).pop() ?? null;
}

export function startLocked(goal: Goal): boolean {
  return goal.checkpoints.some(c => c.status === 'CLEARED');
}

export function respread(goal: Goal, start: number, target: number): number[] {
  const list = [...goal.checkpoints].sort((a, b) => a.index - b.index);
  const fixed = lastDone(goal);
  const base = fixed ? fixed.targetValue : start;
  const open = list.filter(c => !fixed || c.index > fixed.index);
  return list.map(c => {
    const j = open.indexOf(c);
    if (j < 0) return c.targetValue;
    return j === open.length - 1 ? target : round1(base + ((target - base) * (j + 1)) / open.length);
  });
}

export function goalEditError(goal: Goal, start: number, target: number, fmt: (v: number) => string): string | null {
  if (!beyond(goal.path, target, start)) return goal.path === 'LOSE' ? 'The target must be below the start value.' : 'The target must be above the start value.';
  const list = [...goal.checkpoints].sort((a, b) => a.index - b.index);
  const fixed = lastDone(goal);
  if (fixed && !beyond(goal.path, list[0].targetValue, start)) {
    return `The start must stay ${goal.path === 'LOSE' ? 'above' : 'below'} milestone 1 (${fmt(list[0].targetValue)}).`;
  }
  if (fixed && fixed.index === list.length) return 'Every milestone is already reached.';
  if (fixed && !beyond(goal.path, target, fixed.targetValue)) {
    return `The target must be ${goal.path === 'LOSE' ? 'below' : 'above'} milestone ${fixed.index} (${fmt(fixed.targetValue)}).`;
  }
  const open = list.filter(c => !fixed || c.index > fixed.index).length;
  const base = fixed ? fixed.targetValue : start;
  const gap = MIN_GAP[goal.metric];
  if (open && !milestonesFit(base, target, open, gap)) {
    return `Milestones must be at least ${fmt(gap)} apart: the target must be at least ${fmt(gap * open)} ${goal.path === 'LOSE' ? 'below' : 'above'} ${fixed ? `milestone ${fixed.index}` : 'the start'} (${fmt(base)}).`;
  }
  return null;
}

export interface MilestoneRange {
  previous: number;
  next: number | null;
  last: boolean;
}

export function milestoneRange(goal: Goal, cp: Checkpoint): MilestoneRange {
  const list = [...goal.checkpoints].sort((a, b) => a.index - b.index);
  const i = list.findIndex(c => c.id === cp.id);
  const previous = i <= 0 ? goal.startValue : list[i - 1].targetValue;
  const last = i === list.length - 1;
  return { previous, next: last ? null : list[i + 1].targetValue, last };
}

export function milestoneError(goal: Goal, cp: Checkpoint, value: number, fmt: (v: number) => string): string | null {
  const r = milestoneRange(goal, cp);
  if (r.last) return goalEditError(goal, goal.startValue, value, fmt);
  const ok = beyond(goal.path, value, r.previous) && beyond(goal.path, r.next!, value);
  return ok ? null : `Pick a value between ${fmt(r.previous)} and ${fmt(r.next!)}.`;
}
