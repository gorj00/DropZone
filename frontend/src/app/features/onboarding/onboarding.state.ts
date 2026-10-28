import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CanActivateFn, NavigationEnd, Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { filter } from 'rxjs';
import { LengthUnit, Metric, OnboardingRequest, Path, QuestGroup, ProofType, QuestSettings, UnlockMode, WeightUnit } from '../../core/api/models';
import { SessionStore } from '../../core/session.store';
import { CatalogStore } from '../../core/stores';
import { MIN_GAP, displayBounds, milestonesFit, spacedTargets, spreadTargets } from '../../core/plausibility';
import { DisplayUnit, Units, defaultUnits, displayUnit, toDisplay, toMetric } from '../../core/units';
import { ALL_DAYS } from '../../ui/quest-schedule';

export const LIFTS = ['Bench press', 'Squat', 'Deadlift', 'Overhead press'];
export const SIZES = ['Arms', 'Chest', 'Shoulders', 'Thighs'];

interface Schedule { days: number[]; perDay: number; target: number | null; }

export const STEPS = ['profile', 'path', 'goal', 'quests', 'lock'] as const;
export const CHECKPOINT_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
export type OnboardingStep = (typeof STEPS)[number];

export interface OnboardingDraft {
  userId: string;
  step: OnboardingStep;
  path: Path;
  metric: Metric;
  metricLabel: string | null;
  start: number;
  goal: number;
  checkpoints: number;
  questCodes: string[] | null;
  schedules: Record<string, Schedule>;
  lockedApps: string[];
  unlockMode: UnlockMode;
  weightUnit: WeightUnit;
  lengthUnit: LengthUnit;
}

const DRAFT_KEY = 'dz-onboarding';

interface Preset { start: number; goal: number; step: number; label: string | null; }

type PresetKey = 'LOSE' | Metric;

const PRESETS: Record<'metric' | 'imperial', Record<PresetKey, Preset>> = {
  metric: {
    LOSE: { start: 92.4, goal: 78, step: 0.5, label: null },
    WEIGHT: { start: 70, goal: 78, step: 0.5, label: null },
    STRENGTH: { start: 60, goal: 80, step: 2.5, label: LIFTS[0] },
    SIZE: { start: 36, goal: 40, step: 0.5, label: SIZES[0] }
  },
  imperial: {
    LOSE: { start: 204, goal: 172, step: 1, label: null },
    WEIGHT: { start: 154, goal: 172, step: 1, label: null },
    STRENGTH: { start: 135, goal: 175, step: 5, label: LIFTS[0] },
    SIZE: { start: 14, goal: 16, step: 0.25, label: SIZES[0] }
  }
};

export const GROUP_NAMES: Record<QuestGroup, string> = {
  BURN_FUEL: 'Burn & fuel',
  BEAT_BINGE: 'Beat the binge',
  BUILD_FUEL: 'Build & fuel',
  RECOVERY: 'Recovery'
};

export const PROOF_NAMES: Record<ProofType, string> = {
  PHOTO: 'Photo',
  AUTO: 'Auto',
  REPS: 'Counted',
  CHECKIN: 'Check-in',
  LOG: 'Log',
  NONE: 'None'
};

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function trimNum(v: number, digits = 1): string {
  return String(roundTo(v, digits));
}

export function planCheckpoints(start: number, goal: number, count: number, minGap = 0): number[] {
  for (let n = count; n >= 2; n--) {
    const targets = spreadTargets(start, goal, n);
    if (spacedTargets(start, targets, minGap)) return targets;
  }
  return [];
}

export function parseDraft(raw: string | null, userId: string): OnboardingDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<OnboardingDraft>;
    const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string');
    const ok = d.userId === userId && STEPS.includes(d.step as OnboardingStep)
      && (d.path === 'LOSE' || d.path === 'GAIN') && ['WEIGHT', 'STRENGTH', 'SIZE'].includes(d.metric as string)
      && num(d.start) && num(d.goal) && num(d.checkpoints) && (d.questCodes === null || strings(d.questCodes))
      && strings(d.lockedApps) && (d.unlockMode === 'WHOLE_DAY' || d.unlockMode === 'MINUTES')
      && (d.weightUnit === 'KG' || d.weightUnit === 'LB') && (d.lengthUnit === 'CM' || d.lengthUnit === 'IN')
      && typeof d.schedules === 'object' && d.schedules !== null;
    return ok ? ({ ...d, metricLabel: typeof d.metricLabel === 'string' ? d.metricLabel : null } as OnboardingDraft) : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class OnboardingState {
  private readonly catalog = inject(CatalogStore);
  private owner: string | null = null;
  private restoring: Promise<OnboardingStep> | null = null;

  readonly step = signal<OnboardingStep>('profile');
  readonly path = signal<Path>('LOSE');
  readonly metric = signal<Metric>('WEIGHT');
  readonly metricLabel = signal<string | null>(null);
  readonly start = signal(PRESETS[defaultUnits().weight === 'LB' ? 'imperial' : 'metric'].LOSE.start);
  readonly goal = signal(PRESETS[defaultUnits().weight === 'LB' ? 'imperial' : 'metric'].LOSE.goal);
  readonly checkpoints = signal(4);
  readonly questCodes = signal<string[] | null>(null);
  readonly schedules = signal<Record<string, Schedule>>({});
  readonly lockedApps = signal<string[]>(['com.instagram.android']);
  readonly unlockMode = signal<UnlockMode>('WHOLE_DAY');
  readonly weightUnit = signal<WeightUnit>(defaultUnits().weight);
  readonly lengthUnit = signal<LengthUnit>(defaultUnits().length);

  readonly units = computed<Units>(() => ({ weight: this.weightUnit(), length: this.lengthUnit() }));
  readonly unit = computed<'kg' | 'cm'>(() => (this.path() === 'GAIN' && this.metric() === 'SIZE' ? 'cm' : 'kg'));
  readonly displayUnit = computed<DisplayUnit>(() => displayUnit(this.unit(), this.units()));
  readonly imperial = computed(() => this.displayUnit() === 'lb' || this.displayUnit() === 'in');
  readonly precision = computed(() => (this.displayUnit() === 'in' ? 2 : 1));
  readonly preset = computed(() => PRESETS[this.imperial() ? 'imperial' : 'metric'][this.presetKey()]);
  readonly total = computed(() => roundTo(Math.abs(this.goal() - this.start()), this.precision()));
  readonly perCheckpoint = computed(() => this.total() / this.checkpointCount());
  readonly goalMetric = computed<Metric>(() => (this.path() === 'GAIN' ? this.metric() : 'WEIGHT'));
  readonly bounds = computed(() => displayBounds(this.goalMetric(), this.units(), this.precision()));
  readonly minDistance = computed(() => {
    const f = 10 ** this.precision();
    return Math.ceil(toDisplay(2 * MIN_GAP[this.goalMetric()], this.unit(), this.units()) * f - 1e-6) / f;
  });
  readonly track = computed(() => {
    const unit = this.unit();
    const units = this.units();
    return planCheckpoints(this.metricValue(this.start()), this.metricValue(this.goal()), this.checkpoints(), MIN_GAP[this.goalMetric()]).map(t => toDisplay(t, unit, units));
  });
  readonly checkpointCount = computed(() => this.track().length || this.checkpoints());
  readonly fittingCounts = computed(() => {
    const start = this.metricValue(this.start());
    const goal = this.metricValue(this.goal());
    const gap = MIN_GAP[this.goalMetric()];
    return new Set(CHECKPOINT_COUNTS.filter(n => milestonesFit(start, goal, n, gap)));
  });
  readonly problem = computed<'range' | 'direction' | 'close' | null>(() => {
    const b = this.bounds();
    const inRange = (v: number) => Number.isFinite(v) && v >= b.min && v <= b.max;
    if (!inRange(this.start()) || !inRange(this.goal())) return 'range';
    if (this.path() === 'LOSE' ? this.goal() >= this.start() : this.goal() <= this.start()) return 'direction';
    return this.track().length ? null : 'close';
  });
  readonly valid = computed(() => this.problem() === null);
  readonly draft = computed<Omit<OnboardingDraft, 'userId'>>(() => ({
    step: this.step(),
    path: this.path(),
    metric: this.metric(),
    metricLabel: this.metricLabel(),
    start: this.start(),
    goal: this.goal(),
    checkpoints: this.checkpoints(),
    questCodes: this.questCodes(),
    schedules: this.schedules(),
    lockedApps: this.lockedApps(),
    unlockMode: this.unlockMode(),
    weightUnit: this.weightUnit(),
    lengthUnit: this.lengthUnit()
  }));

  constructor() {
    inject(SessionStore).onClear(() => this.reset());
    inject(Router).events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(e => {
      const m = /^\/onboarding\/([a-z]+)/.exec(e.urlAfterRedirects);
      if (m && STEPS.includes(m[1] as OnboardingStep)) this.step.set(m[1] as OnboardingStep);
    });
    effect(() => {
      const draft = this.draft();
      if (this.owner) void Preferences.set({ key: DRAFT_KEY, value: JSON.stringify({ ...draft, userId: this.owner }) }).catch(() => undefined);
    });
  }

  restore(userId: string): Promise<OnboardingStep> {
    if (this.owner === userId) return Promise.resolve(this.step());
    this.restoring ??= this.load(userId).finally(() => (this.restoring = null));
    return this.restoring;
  }

  schedule(code: string): Schedule {
    const saved = this.schedules()[code];
    if (saved) return saved;
    const type = this.catalog.catalog().find(q => q.path === this.path() && q.code === code);
    return { days: type?.defaultDays ?? ALL_DAYS, perDay: type?.defaultPerDay ?? 1, target: null };
  }

  setDays(code: string, days: number[]): void {
    this.schedules.update(s => ({ ...s, [code]: { ...this.schedule(code), days } }));
  }

  setTarget(code: string, target: number): void {
    this.schedules.update(s => ({ ...s, [code]: { ...this.schedule(code), target } }));
  }

  setPerDay(code: string, perDay: number): void {
    this.schedules.update(s => ({ ...s, [code]: { ...this.schedule(code), perDay } }));
  }

  setPath(p: Path): void {
    if (p === this.path()) return;
    this.path.set(p);
    this.questCodes.set(null);
    this.schedules.set({});
    this.applyPreset(p === 'LOSE' ? 'LOSE' : 'WEIGHT');
    this.metric.set('WEIGHT');
  }

  setMetric(m: Metric): void {
    if (m === this.metric()) return;
    this.metric.set(m);
    this.applyPreset(m);
  }

  nudge(which: 'start' | 'goal', dir: 1 | -1): void {
    const p = this.preset();
    const b = this.bounds();
    const sig = which === 'start' ? this.start : this.goal;
    sig.set(roundTo(Math.min(b.max, Math.max(b.min, sig() + dir * p.step)), this.precision()));
  }

  set(which: 'start' | 'goal', raw: string): boolean {
    const v = parseFloat(raw.replace(',', '.'));
    const b = this.bounds();
    if (!Number.isFinite(v) || v < b.min || v > b.max) return false;
    (which === 'start' ? this.start : this.goal).set(roundTo(v, this.precision()));
    return true;
  }

  setWeightUnit(u: WeightUnit): void {
    if (u === this.weightUnit()) return;
    this.switchUnits({ weight: u, length: this.lengthUnit() });
  }

  setLengthUnit(u: LengthUnit): void {
    if (u === this.lengthUnit()) return;
    this.switchUnits({ weight: this.weightUnit(), length: u });
  }

  request(): OnboardingRequest {
    const gain = this.path() === 'GAIN';
    const codes = this.questCodes() ?? [];
    const questSettings: QuestSettings[] = codes
      .filter(code => this.schedules()[code])
      .map(code => {
        const sc = this.schedule(code);
        return { code, days: sc.days, perDay: sc.perDay, ...(sc.target !== null ? { target: sc.target } : {}) };
      });
    return {
      path: this.path(),
      metric: gain ? this.metric() : 'WEIGHT',
      metricLabel: gain && this.metric() !== 'WEIGHT' ? this.metricLabel() : null,
      unit: this.unit(),
      startValue: this.metricValue(this.start()),
      goalValue: this.metricValue(this.goal()),
      checkpoints: this.checkpointCount(),
      questCodes: codes,
      lockedApps: this.lockedApps(),
      unlockMode: this.unlockMode(),
      questSettings,
      weightUnit: this.weightUnit(),
      lengthUnit: this.lengthUnit()
    };
  }

  reset(): void {
    this.owner = null;
    void Preferences.remove({ key: DRAFT_KEY }).catch(() => undefined);
    this.step.set('profile');
    this.path.set('LOSE');
    this.metric.set('WEIGHT');
    this.applyPreset('LOSE');
    this.checkpoints.set(4);
    this.questCodes.set(null);
    this.schedules.set({});
    this.lockedApps.set(['com.instagram.android']);
    this.unlockMode.set('WHOLE_DAY');
  }

  private async load(userId: string): Promise<OnboardingStep> {
    const { value } = await Preferences.get({ key: DRAFT_KEY }).catch(() => ({ value: null }));
    const d = parseDraft(value, userId);
    if (d) {
      this.weightUnit.set(d.weightUnit);
      this.lengthUnit.set(d.lengthUnit);
      this.path.set(d.path);
      this.metric.set(d.metric);
      this.metricLabel.set(d.metricLabel);
      this.start.set(d.start);
      this.goal.set(d.goal);
      this.checkpoints.set(d.checkpoints);
      this.questCodes.set(d.questCodes);
      this.schedules.set(d.schedules);
      this.lockedApps.set(d.lockedApps);
      this.unlockMode.set(d.unlockMode);
      this.step.set(d.step);
    }
    this.owner = userId;
    return this.step();
  }

  private presetKey(): PresetKey {
    return this.path() === 'LOSE' ? 'LOSE' : this.metric();
  }

  private metricValue(v: number): number {
    return roundTo(toMetric(v, this.unit(), this.units()), 3);
  }

  private switchUnits(next: Units): void {
    const before = this.units();
    const convert = (v: number) => toDisplay(toMetric(v, this.unit(), before), this.unit(), next);
    const start = convert(this.start());
    const goal = convert(this.goal());
    this.weightUnit.set(next.weight);
    this.lengthUnit.set(next.length);
    this.start.set(roundTo(start, this.precision()));
    this.goal.set(roundTo(goal, this.precision()));
  }

  private applyPreset(key: PresetKey): void {
    const p = PRESETS[this.imperial() ? 'imperial' : 'metric'][key];
    this.start.set(p.start);
    this.goal.set(p.goal);
    this.metricLabel.set(p.label);
  }
}

export const resumeOnboardingGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionStore);
  const onboarding = inject(OnboardingState);
  const router = inject(Router);
  await session.whenSettled();
  const user = session.user();
  if (!user || user.onboarded) return true;
  const step = await onboarding.restore(user.id);
  return state.url === '/onboarding/profile' && step !== 'profile' ? router.parseUrl(`/onboarding/${step}`) : true;
};
