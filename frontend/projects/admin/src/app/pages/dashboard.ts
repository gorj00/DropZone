import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api';
import { ago, since, weekday, when } from '../core/format';
import type { Overview, SignupDay } from '../core/models';
import { Toast } from '../core/toast';
import { Loading } from '../ui/bits';

export function barHeights(signups: SignupDay[]): { day: string; count: number; pct: number }[] {
  const max = Math.max(1, ...signups.map(s => s.count));
  return signups.map(s => ({ day: s.day, count: s.count, pct: Math.round((s.count / max) * 100) }));
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Loading],
  template: `
    <div class="flex items-center gap-4">
      <h1 class="h text-[30px] flex-1">Dashboard</h1>
      <button class="btn btn-ghost btn-sm" (click)="load()" [disabled]="loading()">Refresh</button>
    </div>

    @if (data(); as d) {
      <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mt-6">
        <div class="stat"><span class="lbl">Users</span><b>{{ d.totals.users }}</b></div>
        <div class="stat"><span class="lbl">Onboarded</span><b>{{ d.totals.onboarded }}</b></div>
        <div class="stat"><span class="lbl">PRO</span><b class="text-gold">{{ d.totals.subscribed }}</b></div>
        <div class="stat"><span class="lbl">Trial</span><b class="text-accent2">{{ d.totals.trial }}</b></div>
        <div class="stat" [class.warn]="d.totals.suspended > 0"><span class="lbl">Suspended</span><b>{{ d.totals.suspended }}</b></div>
        <div class="stat"><span class="lbl">New · 7 d</span><b>{{ d.totals.newLast7Days }}</b></div>
        <div class="stat"><span class="lbl">Active · 7 d</span><b>{{ d.totals.activeLast7Days }}</b></div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <div class="card p-5 xl:col-span-2">
          <div class="flex items-baseline justify-between">
            <div class="lbl">Sign-ups per day · last 30 days</div>
            <div class="text-[12.5px] text-mute">{{ signupTotal() }} total</div>
          </div>
          <div class="bars mt-4" role="img" [attr.aria-label]="signupTotal() + ' sign-ups in 30 days'">
            @for (b of bars(); track b.day) {
              <i [style.height.%]="b.pct" [class.hi]="b.count > 0" [title]="weekday(b.day) + ': ' + b.count"></i>
            }
          </div>
          <div class="flex justify-between text-[11px] text-mute mt-2">
            <span>{{ weekday(bars()[0].day) }}</span><span>{{ weekday(bars()[bars().length - 1].day) }}</span>
          </div>
        </div>

        <div class="card p-5" [class.card-danger]="d.health.errorsLast5Minutes > 0">
          <div class="lbl">Server</div>
          <div class="kv mt-3">
            <span>Errors · 5 min</span><span class="num" [class.text-danger]="d.health.errorsLast5Minutes > 0">{{ d.health.errorsLast5Minutes }}</span>
            <span>Errors · 24 h</span><span class="num"><a routerLink="/errors" class="underline decoration-dotted">{{ d.errorsLast24Hours }}</a></span>
            <span>Busy · 5 min</span><span class="num" [class.text-danger]="d.health.busyLast5Minutes > 0">{{ d.health.busyLast5Minutes }}</span>
            <span>DB waits · 5 min</span><span class="num" [class.text-danger]="d.health.databaseWaitsLast5Minutes > 0">{{ d.health.databaseWaitsLast5Minutes }}</span>
            <span>In flight</span><span class="num">{{ d.health.inFlight }}</span>
            <span>DB pool</span><span class="num">{{ d.health.poolActive }} active · {{ d.health.poolIdle }} idle · {{ d.health.poolWaiting }} waiting · max {{ d.health.poolMax }}</span>
            <span>Heap</span><span class="num">{{ d.health.heapUsedMb }} / {{ d.health.heapMaxMb }} MB</span>
            <span>Up since</span><span>{{ when(d.health.startedAt) }} · {{ since(d.health.startedAt) }}</span>
            <span>Build</span><span class="mono">{{ d.health.version || '?' }} · {{ d.health.commit || '?' }}{{ d.health.revision ? ' · ' + d.health.revision : '' }}</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <div class="card p-5" [class.card-danger]="d.failedJobs > 0">
          <div class="flex items-center justify-between">
            <div class="lbl">Scheduled jobs</div>
            <a routerLink="/jobs" class="text-[12.5px] text-accent2 font-semibold">All jobs</a>
          </div>
          <div class="mt-3 divide-y divide-line">
            @for (j of d.jobs; track j.name) {
              <div class="py-2 flex items-center gap-3">
                <span class="flex-1 font-semibold text-[13.5px] truncate">{{ j.name }}</span>
                @if (j.failedAt) {
                  <span class="tag tag-danger" [title]="j.error ?? ''">Failed {{ ago(j.failedAt) }}</span>
                } @else if (j.lastRunAt) {
                  <span class="tag tag-ok">OK {{ ago(j.lastRunAt) }}</span>
                } @else {
                  <span class="tag tag-plain">Never ran</span>
                }
              </div>
            }
          </div>
        </div>

        <div class="card p-5" [class.card-danger]="d.openReports > 0">
          <div class="flex items-center justify-between">
            <div class="lbl">Moderation</div>
            <a routerLink="/reports" class="text-[12.5px] text-accent2 font-semibold">Open queue</a>
          </div>
          <div class="mt-3 flex items-baseline gap-3">
            <b class="h text-[42px]" [class.text-danger]="d.openReports > 0">{{ d.openReports }}</b>
            <span class="text-mute font-semibold">{{ d.openReports === 1 ? 'item' : 'items' }} to review</span>
          </div>
        </div>

        <div class="card p-5">
          <div class="flex items-center justify-between">
            <div class="lbl">Latest billing events</div>
            <a routerLink="/billing" class="text-[12.5px] text-accent2 font-semibold">All events</a>
          </div>
          <div class="mt-3 divide-y divide-line">
            @for (e of d.billingEvents; track e.id) {
              <div class="py-2 flex items-center gap-3 text-[13px]">
                <span class="tag tag-plain">{{ e.type }}</span>
                <span class="flex-1 truncate text-mute" [title]="e.email ?? e.appUserId ?? ''">{{ e.email ?? e.appUserId ?? '—' }}</span>
                <span class="text-mute whitespace-nowrap">{{ ago(e.receivedAt) }}</span>
              </div>
            } @empty {
              <div class="py-2 text-[13px] text-mute">No events yet.</div>
            }
          </div>
        </div>
      </div>
    } @else if (loading()) {
      <div class="mt-6"><adm-loading /></div>
    } @else {
      <div class="card p-6 mt-6 text-center">
        <div class="font-bold">Couldn't load the dashboard</div>
        <button class="btn btn-ghost btn-sm mt-3" (click)="load()">Retry</button>
      </div>
    }
  `
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(Toast);

  protected readonly data = signal<Overview | null>(null);
  protected readonly loading = signal(true);
  protected readonly bars = computed(() => barHeights(this.data()?.signups ?? []));
  protected readonly signupTotal = computed(() => (this.data()?.signups ?? []).reduce((sum, s) => sum + s.count, 0));
  protected readonly ago = ago;
  protected readonly when = when;
  protected readonly since = since;
  protected readonly weekday = weekday;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.data.set(await this.api.overview());
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.loading.set(false);
    }
  }
}
