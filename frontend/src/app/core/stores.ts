import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api/api.service';
import { apiError } from './api/errors';
import { Checkpoint, CheckpointPatch, Goal, GoalPatch, QuestType, Today, TodayQuest } from './api/models';
import { LockService } from './native/lock';
import { SessionStore } from './session.store';

export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return n.toFixed(digits);
}

@Injectable({ providedIn: 'root' })
export class TodayStore {
  private readonly api = inject(ApiService);
  private readonly lock = inject(LockService);
  private readonly session = inject(SessionStore);

  readonly today = signal<Today | null>(null);
  readonly loading = signal(false);
  readonly left = computed(() => {
    const t = this.today();
    return t ? Math.max(0, t.totalCount - t.doneCount) : 0;
  });

  constructor() {
    this.session.onClear(() => this.reset());
  }

  reset(): void {
    this.today.set(null);
    this.loading.set(false);
  }

  async load(): Promise<Today> {
    this.loading.set(true);
    try {
      const t = await this.api.today(localDate());
      this.today.set(t);
      void this.syncLock(t).catch(() => undefined);
      return t;
    } finally {
      this.loading.set(false);
    }
  }

  private async syncLock(t: Today): Promise<void> {
    await this.lock.sync(this.session.user(), t);
    if (this.lock.native) await this.lock.refreshStatus();
  }

  patchQuest(updated: TodayQuest): void {
    const t = this.today();
    if (!t) return;
    const quests = t.quests.map(q => (q.quest.id === updated.quest.id && q.slot === updated.slot ? updated : q));
    this.today.set({ ...t, quests, doneCount: quests.filter(q => q.status === 'DONE').length });
  }
}

@Injectable({ providedIn: 'root' })
export class GoalStore {
  private readonly api = inject(ApiService);

  readonly goal = signal<Goal | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly active = computed(() => this.goal()?.checkpoints.find(c => c.status === 'ACTIVE' || c.status === 'PENDING_VERIFICATION') ?? null);
  readonly progressPct = computed(() => {
    const g = this.goal();
    return g && g.totalValue > 0 ? Math.min(100, Math.max(0, (g.progressValue / g.totalValue) * 100)) : 0;
  });

  constructor() {
    inject(SessionStore).onClear(() => this.reset());
  }

  reset(): void {
    this.goal.set(null);
    this.loading.set(false);
    this.error.set(false);
  }

  async load(): Promise<Goal | null> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const g = await this.api.goal();
      this.goal.set(g);
      return g;
    } catch (e) {
      if (apiError(e).status === 404) this.goal.set(null);
      this.error.set(true);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  checkpoint(id: string): Checkpoint | null {
    return this.goal()?.checkpoints.find(c => c.id === id) ?? null;
  }

  async update(id: string, patch: CheckpointPatch): Promise<Checkpoint> {
    const cp = await this.api.updateCheckpoint(id, patch);
    this.replace(cp);
    return cp;
  }

  async updateGoal(patch: GoalPatch): Promise<Goal> {
    const g = await this.api.updateGoal(patch);
    this.goal.set(g);
    return g;
  }

  replace(cp: Checkpoint): void {
    const g = this.goal();
    if (g) this.goal.set({ ...g, checkpoints: g.checkpoints.map(c => (c.id === cp.id ? cp : c)) });
  }
}

@Injectable({ providedIn: 'root' })
export class CatalogStore {
  private readonly api = inject(ApiService);
  readonly catalog = signal<QuestType[]>([]);

  constructor() {
    inject(SessionStore).onClear(() => this.reset());
  }

  reset(): void {
    this.catalog.set([]);
  }

  async load(): Promise<QuestType[]> {
    if (this.catalog().length) return this.catalog();
    const c = await this.api.catalog();
    this.catalog.set(c);
    return c;
  }
}
