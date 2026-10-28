import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { QuestGroup, QuestType } from '../../core/api/models';
import { SessionStore } from '../../core/session.store';
import { CatalogStore } from '../../core/stores';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { StepBar } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { GoalKind, QuestSchedule, daysLabel, goalKindOf, goalOf, goalText } from '../../ui/quest-schedule';
import { GROUP_NAMES, OnboardingState, PROOF_NAMES } from './onboarding.state';

const GROUPS: Record<'LOSE' | 'GAIN', QuestGroup[]> = {
  LOSE: ['BURN_FUEL', 'BEAT_BINGE'],
  GAIN: ['BUILD_FUEL', 'RECOVERY']
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepBar, Icon, QuestSchedule],
  template: `
    <div class="screen">
      <app-step-bar [step]="4" />
      <div class="pad mt-3">
        <div class="flex items-center gap-2">
          <div class="h text-[38px]">Quest loadout</div>
          @if (state.path() === 'GAIN') { <span class="tag" [class.tag-cyan]="theme.isNeon()" [class.tag-free]="!theme.isNeon()">Muscle</span> }
        </div>
        <p class="text-[14.5px] text-mute mt-1.5">Clear them all to unlock your apps.</p>
      </div>

      <div class="pad mt-3">
        @if (loading()) {
          @for (g of [0, 1]; track g) {
            <div class="skeleton h-3 w-24 mt-3 mb-2.5"></div>
            <div class="grid grid-cols-3 gap-2">
              @for (t of [0, 1, 2, 3, 4, 5]; track t) { <div class="skeleton h-[80px] rounded-2xl"></div> }
            </div>
          }
        } @else if (failed()) {
          <div class="card p-5 text-center mt-3">
            <div class="font-bold">Couldn't load quests</div>
            <button class="btn btn-ghost btn-sm mx-auto mt-3" (click)="load()"><app-icon name="refresh" />Retry</button>
          </div>
        } @else {
          @for (g of groups(); track g.group; let first = $first) {
            <div class="lbl mb-2.5" [class.mt-3]="!first">{{ g.name }}</div>
            <div class="grid grid-cols-3 gap-2">
              @for (q of g.quests; track q.code) {
                @let on = selected().has(q.code);
                @let locked = !pro() && !q.free;
                <button class="tile" [class.on]="on" [class.pro]="locked" (click)="toggle(q)">
                  @if (on) { <span class="check"><app-icon name="check" /></span> }
                  @if (locked) { <span class="pro-badge"><app-icon name="crown" /></span> }
                  <span class="ti"><app-icon [name]="q.icon" /></span>
                  <b>{{ q.name }}</b>
                  <small>{{ proofName(q) }}</small>
                </button>
              }
            </div>
          }
          <button class="mt-2.5 w-full h-[44px] rounded-[14px] border border-dashed flex items-center justify-center gap-2 font-bold text-[13.5px] text-gold"
                  style="border-color:rgba(var(--gold-rgb),.45)" (click)="custom()">
            <app-icon name="plus" [size]="16" />Create custom quest
            @if (!pro()) { <span class="tag tag-pro"><app-icon name="crown" />PRO</span> }
          </button>

          @if (chosen().length) {
            <div class="lbl mt-5 mb-2.5">Schedule</div>
            <div class="space-y-2">
              @for (q of chosen(); track q.code) {
                @let sc = state.schedule(q.code);
                <div class="card p-3.5">
                  <div class="flex items-center gap-2.5 mb-3">
                    <span class="w-8 h-8 rounded-[10px] bg-s2 grid place-items-center text-accent flex-none"><app-icon [name]="q.icon" [size]="17" /></span>
                    <div class="flex-1 min-w-0">
                      <div class="font-bold text-[14.5px] truncate">{{ q.name }}</div>
                      <div class="text-[11.5px] text-mute truncate">{{ summary(q, sc.days, sc.perDay, sc.target) }}</div>
                    </div>
                  </div>
                  <app-quest-schedule [days]="sc.days" [perDay]="q.multiSlot ? sc.perDay : null"
                    [goal]="goal(q, sc.target)" [goalKind]="kind(q)"
                    (daysChange)="state.setDays(q.code, $event)" (perDayChange)="state.setPerDay(q.code, $event)" (goalChange)="state.setTarget(q.code, $event)" />
                </div>
              }
            </div>
          }
        }
      </div>

      <div class="mt-auto pad pt-6 pb-[calc(32px+env(safe-area-inset-bottom))] flex items-center gap-3">
        <div class="card h-[56px] px-4 flex flex-col justify-center rounded-[14px]">
          <span class="num text-[24px] leading-none">{{ selected().size }}</span>
          <span class="lbl text-[9px]">{{ pro() ? 'quests' : 'free' }}</span>
        </div>
        <button class="btn btn-primary flex-1" [disabled]="!selected().size" (click)="next()">Continue</button>
      </div>
    </div>
  `
})
export class QuestsPage implements OnInit {
  protected readonly theme = inject(ThemeService);
  protected readonly state = inject(OnboardingState);
  private readonly catalog = inject(CatalogStore);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly pro = this.session.onboardingPro;
  protected readonly selected = computed(() => new Set(this.state.questCodes() ?? []));
  protected readonly chosen = computed(() => {
    const picked = this.selected();
    return this.catalog.catalog().filter(q => q.path === this.state.path() && picked.has(q.code));
  });
  protected readonly groups = computed(() => {
    const path = this.state.path();
    const list = this.catalog.catalog().filter(q => q.path === path);
    return GROUPS[path]
      .map(group => ({ group, name: GROUP_NAMES[group], quests: list.filter(q => q.group === group) }))
      .filter(g => g.quests.length);
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const all = await this.catalog.load();
      if (this.state.questCodes() === null) {
        this.state.questCodes.set(all.filter(q => q.path === this.state.path() && q.free).map(q => q.code));
      }
    } catch (e) {
      this.failed.set(true);
      this.toast.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  protected summary(q: QuestType, days: number[], perDay: number, target: number | null): string {
    const when = daysLabel(days);
    const kind = goalKindOf(q);
    const value = goalOf(q, target);
    if (kind && value) return `${goalText(kind, value)} · ${when}`;
    return q.multiSlot && perDay > 1 ? `${perDay} meals a day · ${when}` : when;
  }

  protected kind(q: QuestType): GoalKind | null {
    return goalKindOf(q);
  }

  protected goal(q: QuestType, target: number | null): number | null {
    return goalOf(q, target);
  }

  protected proofName(q: QuestType): string {
    return PROOF_NAMES[q.proof] ?? '';
  }

  protected toggle(q: QuestType): void {
    if (!this.pro() && !q.free) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    const codes = this.state.questCodes() ?? [];
    this.state.questCodes.set(codes.includes(q.code) ? codes.filter(c => c !== q.code) : [...codes, q.code]);
  }

  protected custom(): void {
    if (!this.pro()) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    this.toast.show('Add custom quests in Settings once your drop is set.');
  }

  protected next(): void {
    if (this.selected().size) void this.router.navigateByUrl('/onboarding/lock');
  }
}
