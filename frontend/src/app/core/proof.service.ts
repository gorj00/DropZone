import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api/api.service';
import { apiError } from './api/errors';
import { Checkpoint, Goal, TodayQuest } from './api/models';
import { CameraResult, CameraService, dataUrlToBlob } from './camera.service';
import { HealthService } from './native/health';
import { ScaleUnit } from './native/vision';
import { isBigJump, proofTolerance, reachesTarget } from './plausibility';
import { PromptService } from './prompt.service';
import { SessionStore } from './session.store';
import { GoalStore, TodayStore, localDate } from './stores';
import { ToastService } from './toast.service';
import { UnitsService } from './units';

interface Job {
  send: () => Promise<TodayQuest | null>;
  after?: () => Promise<void>;
}

export function isOffline(e: unknown): boolean {
  return apiError(e).status === 0;
}

export function pendingKey(date: string, tq: TodayQuest): string {
  return `${date}:${tq.quest.id}:${tq.slot}`;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

@Injectable({ providedIn: 'root' })
export class ProofService {
  private readonly api = inject(ApiService);
  private readonly camera = inject(CameraService);
  private readonly health = inject(HealthService);
  private readonly today = inject(TodayStore);
  private readonly goals = inject(GoalStore);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly prompt = inject(PromptService);
  private readonly units = inject(UnitsService);
  private readonly router = inject(Router);
  private readonly jobs = new Map<string, Job>();
  private syncedYesterday: string | null = null;

  readonly pending = signal<ReadonlySet<string>>(new Set());

  async uploadDataUrl(dataUrl: string): Promise<string> {
    const { url } = await this.api.upload(dataUrlToBlob(dataUrl), `proof-${Date.now()}.jpg`);
    return url;
  }

  isPending(date: string, tq: TodayQuest): boolean {
    return this.pending().has(pendingKey(date, tq));
  }

  async complete(tq: TodayQuest): Promise<TodayQuest | null> {
    const date = localDate();
    const key = pendingKey(date, tq);
    const queued = this.jobs.get(key);
    if (queued) return this.attempt(key, queued);
    let job: Job | null;
    try {
      job = await this.capture(tq, date);
    } catch (e) {
      this.toast.error(e);
      return null;
    }
    return job ? this.attempt(key, job) : null;
  }

  async confirmJump(value: number, current: number | null, unit: 'kg' | 'cm', label: string): Promise<number | null> {
    let v = value;
    while (current !== null && isBigJump(current, v, unit)) {
      const diff = this.units.amount(Math.abs(v - current), unit);
      const ok = await this.prompt.confirm(
        `Is ${this.units.amount(v, unit)} right?`,
        `That's ${diff} ${v > current ? 'more' : 'less'} than your current ${this.units.amount(current, unit)}. Check it for a typo before saving.`,
        'Save it',
        'Fix it'
      );
      if (ok) return v;
      const shown = await this.prompt.number(label, this.units.label(unit), round1(this.units.value(v, unit)));
      if (shown === null) return null;
      v = this.units.toMetric(shown, unit);
    }
    return v;
  }

  async logMeasurement(goal: Goal): Promise<Goal | null> {
    if (goal.metric === 'WEIGHT') return null;
    const label = goal.metricLabel ?? (goal.metric === 'STRENGTH' ? 'Lift' : 'Measurement');
    const shown = await this.prompt.number(label, this.units.label(goal.unit), round1(this.units.value(goal.currentValue, goal.unit)));
    if (shown === null) return null;
    const value = await this.confirmJump(this.units.toMetric(shown, goal.unit), goal.currentValue, goal.unit, label);
    if (value === null) return null;
    try {
      const updated = await this.api.logGoalProgress(value, localDate());
      this.goals.goal.set(updated);
      this.toast.show(`${label}: ${this.units.amount(value, goal.unit)} saved.`);
      return updated;
    } catch (e) {
      this.toast.error(e);
      return null;
    }
  }

  async syncAuto(): Promise<void> {
    if (!(await this.health.available())) return;
    const t = this.today.today();
    if (t) {
      for (const updated of await this.syncDay(t.date, t.quests)) this.today.patchQuest(updated);
    }
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = localDate(d);
    if (this.syncedYesterday === yesterday) return;
    try {
      const open = (await this.api.today(yesterday)).quests.filter(q => q.quest.proof === 'AUTO' && q.status !== 'DONE');
      const synced = await this.syncDay(yesterday, open);
      if (open.every(q => synced.some(u => u.quest.id === q.quest.id && u.slot === q.slot && u.status === 'DONE'))) this.syncedYesterday = yesterday;
      if (synced.some(u => u.status === 'DONE')) void this.today.load().catch(() => undefined);
    } catch { }
  }

  async checkpointProof(goal: Goal, cp: Checkpoint): Promise<Checkpoint | null> {
    try {
      const weight = goal.metric === 'WEIGHT';
      const shot = await this.camera.open({
        mode: weight ? 'WEIGH_IN' : 'PHOTO',
        title: `Milestone ${cp.index}`,
        expected: weight ? this.units.value(goal.currentValue) : null,
        unit: weight ? this.scaleUnit() : undefined,
        check: { metric: goal.metric, friends: cp.verification === 'COMMUNITY' }
      });
      if (!shot) return null;
      const label = weight ? 'Weight on the scale' : goal.metricLabel ?? 'Value';
      const shown = (weight ? shot.number : null) ?? await this.prompt.number(label, this.units.label(goal.unit));
      if (shown === null) return null;
      const value = await this.confirmJump(this.units.toMetric(shown, goal.unit), goal.currentValue, goal.unit, label);
      if (value === null) return null;
      return await this.sendCheckpointProof(cp, shot, value);
    } catch (e) {
      this.toast.error(e);
      return null;
    }
  }

  private async capture(tq: TodayQuest, date: string): Promise<Job | null> {
    const q = tq.quest;
    if (q.code === 'WEIGH_IN') return this.captureWeighIn(tq, date);
    switch (q.proof) {
      case 'PHOTO': {
        const shot = await this.camera.open({
          mode: 'PHOTO',
          title: tq.slots > 1 ? `${q.name} · meal ${tq.slot}` : `${q.name} proof`,
          check: { quest: q.custom ? null : q.code, friends: q.squadCheck && this.session.pro() }
        });
        if (!shot) return null;
        const photo = this.uploader(shot.dataUrl);
        return { send: async () => this.api.completeQuest(q.id, { date, slot: tq.slot, photoUrl: await photo(), mlLabels: shot.labels }) };
      }
      case 'REPS': {
        const shot = await this.camera.open({ mode: 'REPS', title: q.name, targetReps: q.target ?? undefined });
        if (!shot) return null;
        const photo = this.uploader(shot.dataUrl);
        return { send: async () => this.api.completeQuest(q.id, { date, slot: tq.slot, photoUrl: await photo(), reps: shot.reps ?? 0, exercise: shot.exercise ?? 'SQUAT' }) };
      }
      case 'AUTO': {
        const value = await this.autoValue(tq, date);
        return value === null ? null : { send: () => this.api.completeQuest(q.id, { date, slot: tq.slot, value }) };
      }
      case 'LOG': {
        const shown = await this.prompt.number(q.name, this.units.weightLabel(), q.target === null ? null : round1(this.units.value(q.target)));
        if (shown === null) return null;
        const goal = this.goals.goal() ?? await this.goals.load();
        const value = await this.confirmJump(this.units.toMetric(shown), goal?.metric === 'STRENGTH' ? goal.currentValue : null, 'kg', q.name);
        if (value === null) return null;
        return { send: () => this.api.completeQuest(q.id, { date, slot: tq.slot, value }), after: () => this.offerGoalProgress(value, date) };
      }
      default:
        return { send: () => this.api.completeQuest(q.id, { date, slot: tq.slot }) };
    }
  }

  private async captureWeighIn(tq: TodayQuest, date: string): Promise<Job | null> {
    const unit = this.scaleUnit();
    const kg = await this.currentWeight();
    const shot = await this.camera.open({
      mode: 'WEIGH_IN', title: 'Weigh-in proof', expected: kg === null ? null : this.units.value(kg), unit,
      check: { quest: 'WEIGH_IN', textOnly: true, friends: tq.quest.squadCheck && this.session.pro() }
    });
    if (!shot) return null;
    const shown = shot.number ?? await this.prompt.number('Weight on the scale', unit);
    if (shown === null) return null;
    const value = await this.confirmJump(this.units.toMetric(shown), kg, 'kg', 'Weight on the scale');
    if (value === null) return null;
    const photo = this.uploader(shot.dataUrl);
    return {
      send: async () => {
        await this.api.weighIn({ date, value, photoUrl: await photo(), mlText: shot.text ?? undefined });
        await Promise.all([this.today.load().catch(() => null), this.goals.load()]);
        return this.today.today()?.quests.find(x => x.quest.id === tq.quest.id) ?? null;
      },
      after: () => this.offerMilestoneProof(shot, value)
    };
  }

  private async attempt(key: string, job: Job): Promise<TodayQuest | null> {
    for (;;) {
      let updated: TodayQuest | null;
      try {
        updated = await job.send();
      } catch (e) {
        if (!isOffline(e)) {
          this.forget(key);
          this.toast.error(e);
          return null;
        }
        this.keep(key, job);
        const again = await this.prompt.confirm("You're offline", 'Your proof is kept on this phone. Retry now, or tap the quest again when you are back online.', 'Retry', 'Later');
        if (!again) return null;
        continue;
      }
      this.forget(key);
      if (updated) this.today.patchQuest(updated);
      void this.today.load().catch(() => undefined);
      void this.session.refresh().catch(() => undefined);
      if (job.after) await job.after().catch(e => this.toast.error(e));
      return updated;
    }
  }

  private keep(key: string, job: Job): void {
    this.jobs.set(key, job);
    this.pending.set(new Set(this.jobs.keys()));
  }

  private forget(key: string): void {
    if (!this.jobs.delete(key)) return;
    this.pending.set(new Set(this.jobs.keys()));
  }

  private uploader(dataUrl: string): () => Promise<string> {
    let url: Promise<string> | null = null;
    return () => (url ??= this.uploadDataUrl(dataUrl).catch(e => {
      url = null;
      throw e;
    }));
  }

  private async autoValue(tq: TodayQuest, date: string): Promise<number | null> {
    const need = tq.quest.autoSource === 'SLEEP' ? 'sleep' : 'steps';
    if (!this.health.native) {
      this.toast.show('Health Connect sync works in the Android app.', true);
      return null;
    }
    const access = await this.health.authorize(need);
    if (access === 'unavailable') {
      if (need === 'steps') {
        await this.stepsUnavailable(tq);
        return null;
      }
      const install = await this.prompt.confirm('Install Health Connect', 'Steps and sleep quests sync from Health Connect. Install it from Google Play, then tap the quest again.', 'Open Google Play', 'Not now');
      if (install) this.health.openInstall();
      return null;
    }
    if (access === 'denied') this.toast.show(`Allow ${need} access in Health Connect to sync this quest.`, true);
    if (access !== 'granted') return null;
    return (need === 'sleep' ? await this.health.sleepMinutes(date) : await this.health.steps(date)) ?? 0;
  }

  private async stepsUnavailable(tq: TodayQuest): Promise<void> {
    const choice = await this.prompt.choose('Health Connect is missing', [
      { key: 'install', label: 'Install Health Connect', icon: 'download' },
      { key: 'stop', label: 'Stop using steps', icon: 'trash', danger: true }
    ], 'Steps quests count your steps from Health Connect. Install it from Google Play, or stop using this quest.');
    if (choice === 'install') this.health.openInstall();
    else if (choice === 'stop') await this.stopSteps(tq);
  }

  private async stopSteps(tq: TodayQuest): Promise<void> {
    const name = tq.quest.name;
    const ok = await this.prompt.confirm(`Stop using ${name}?`, `${name} will be removed from your daily quests. You can add it back in Settings anytime.`, 'Remove', 'Cancel');
    if (!ok) return;
    try {
      const quests = await this.api.quests();
      if (!quests.some(q => q.id !== tq.quest.id)) {
        this.toast.show('Keep at least one daily quest. Add another one in Settings first.', true);
        return;
      }
      await this.api.deleteQuest(tq.quest.id);
      this.toast.show(`${name} removed from your daily quests.`);
      await this.today.load().catch(() => undefined);
      void this.session.refresh().catch(() => undefined);
    } catch (e) {
      this.toast.error(e);
    }
  }

  private async syncDay(date: string, quests: TodayQuest[]): Promise<TodayQuest[]> {
    const out: TodayQuest[] = [];
    for (const tq of quests.filter(x => x.quest.proof === 'AUTO' && x.status !== 'DONE')) {
      const value = tq.quest.autoSource === 'SLEEP' ? await this.health.sleepMinutes(date) : await this.health.steps(date);
      if (value === null) continue;
      try { out.push(await this.api.completeQuest(tq.quest.id, { date, slot: tq.slot, value })); } catch { }
    }
    return out;
  }

  private async offerMilestoneProof(shot: CameraResult, value: number): Promise<void> {
    const goal = this.goals.goal();
    const cp = goal?.checkpoints.find(c => c.status === 'ACTIVE');
    if (!goal || !cp || goal.metric !== 'WEIGHT' || !reachesTarget(goal.path, value, cp.targetValue, proofTolerance('kg', this.units.units()))) return;
    const ok = await this.prompt.confirm(
      'Use this weigh-in as milestone proof?',
      `${this.units.amount(value)} reaches milestone ${cp.index} (${this.units.amount(cp.targetValue)}). The same scale photo is used, no second photo needed.`,
      'Use as proof',
      'Not now'
    );
    if (!ok) return;
    const updated = await this.sendCheckpointProof(cp, shot, value);
    if (updated?.status === 'CLEARED') await this.router.navigate(['/journey', updated.id, 'cleared']);
    else if (updated?.status === 'PENDING_VERIFICATION') await this.router.navigate(['/journey', updated.id, 'proof']);
  }

  private async sendCheckpointProof(cp: Checkpoint, shot: CameraResult, value: number): Promise<Checkpoint | null> {
    const photo = this.uploader(shot.dataUrl);
    for (;;) {
      try {
        const updated = await this.api.submitCheckpointProof(cp.id, { photoUrl: await photo(), value, mlLabels: shot.labels, mlText: shot.text ?? undefined });
        this.goals.replace(updated);
        void this.goals.load();
        return updated;
      } catch (e) {
        if (!isOffline(e)) {
          this.toast.error(e);
          return null;
        }
        const again = await this.prompt.confirm("You're offline", 'Your milestone proof is kept while this is open. Check your connection and retry.', 'Retry', 'Cancel');
        if (!again) return null;
      }
    }
  }

  private scaleUnit(): ScaleUnit {
    return this.units.weightLabel() === 'lb' ? 'lb' : 'kg';
  }

  private async currentWeight(): Promise<number | null> {
    const goal = this.goals.goal() ?? await this.goals.load();
    return goal?.metric === 'WEIGHT' ? goal.currentValue : null;
  }

  private async offerGoalProgress(value: number, date: string): Promise<void> {
    const goal = this.goals.goal() ?? await this.goals.load();
    if (!goal || goal.path !== 'GAIN' || goal.metric !== 'STRENGTH') return;
    const lift = goal.metricLabel ?? 'lift';
    const ok = await this.prompt.confirm(`Count ${this.units.amount(value)}?`, `Add it to your ${lift} goal progress. Milestone rewards still need a proof to clear.`, 'Count it');
    if (!ok) return;
    try {
      this.goals.goal.set(await this.api.logGoalProgress(value, date));
      this.toast.show(`${lift} goal updated`);
    } catch (e) {
      this.toast.error(e);
    }
  }
}
