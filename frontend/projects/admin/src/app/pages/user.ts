import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api';
import { ago, day, num, when } from '../core/format';
import type { Account, DayView } from '../core/models';
import { Session } from '../core/session';
import { Toast } from '../core/toast';
import { Avatar, Loading, PlanTag } from '../ui/bits';

export const RANGES = [30, 90, 365] as const;

export function rangeFrom(days: number, today = new Date()): string {
  const from = new Date(today);
  from.setDate(from.getDate() - (days - 1));
  return from.toISOString().slice(0, 10);
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, PlanTag, Loading],
  template: `
    <a routerLink="/users" class="text-[12.5px] text-accent2 font-semibold">← Users</a>

    @if (missing()) {
      <div class="card p-8 mt-4 text-center"><div class="h text-[24px]">User not found</div><p class="text-mute mt-2">The account may have been deleted.</p></div>
    } @else if (account(); as a) {
      <div class="flex items-start gap-5 mt-3">
        <adm-avatar [url]="a.user.avatarUrl" [name]="a.user.displayName" [size]="64" />
        <div class="flex-1 min-w-0">
          <h1 class="h text-[30px] truncate">{{ a.user.displayName }}</h1>
          <div class="text-mute mt-1">&#64;{{ a.user.handle }} · {{ a.user.email }}</div>
          <div class="flex flex-wrap gap-1.5 mt-2">
            <adm-plan [user]="a.user" />
            @if (a.user.admin) { <span class="tag tag-accent">Admin</span> }
            @if (!a.user.onboarded) { <span class="tag tag-plain">Not onboarded</span> }
            @if (a.user.suspended) { <span class="tag tag-danger">Suspended</span> }
            @if (a.user.strikes > 0) { <span class="tag tag-plain">{{ a.user.strikes }} strike{{ a.user.strikes === 1 ? '' : 's' }}</span> }
          </div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="resetProfile()">Reset profile</button>
          @if (!self()) {
            @if (a.user.suspended) {
              <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="unsuspend()">Unsuspend</button>
            } @else {
              <button class="btn btn-danger btn-sm" [disabled]="busy()" (click)="suspend()">Suspend</button>
            }
          }
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-5">
        <div class="card p-5">
          <div class="lbl">Account</div>
          <div class="kv mt-3">
            <span>User id</span><span class="mono break-all">{{ a.user.id }}</span>
            <span>Joined</span><span>{{ when(a.user.createdAt) }}</span>
            <span>Last seen</span><span>{{ when(a.user.lastSeenAt) }} ({{ ago(a.user.lastSeenAt) }})</span>
            <span>Timezone</span><span>{{ a.user.timezone }}</span>
            <span>Path</span><span>{{ a.user.path ?? '—' }}</span>
            <span>Units</span><span>{{ a.weightUnit }} · {{ a.lengthUnit }}</span>
            <span>Streak</span><span>{{ a.user.streak }} (best {{ a.bestStreak }})</span>
            <span>Unlock mode</span><span>{{ a.unlockMode }}</span>
            <span>Verification</span><span>{{ a.defaultVerification }}{{ a.publicByDefault ? ' · public by default' : '' }}</span>
            <span>Privacy</span><span>{{ a.hiddenFromSearch ? 'hidden from search' : 'searchable' }} · {{ a.hiddenFromLeaderboards ? 'off leaderboards' : 'on leaderboards' }}{{ a.skipRestDays ? ' · skips rest days' : '' }}</span>
            <span>Bio</span><span class="whitespace-pre-line break-words">{{ a.bio ?? '—' }}</span>
            <span>Counts</span><span>{{ a.counts.posts }} posts · {{ a.counts.comments }} comments · {{ a.counts.friends }} friends · {{ a.counts.days }} logged days · {{ a.counts.devices }} devices</span>
          </div>
        </div>

        <div class="card p-5">
          <div class="lbl">Plan &amp; billing</div>
          <div class="kv mt-3">
            <span>Subscribed</span><span>{{ a.billing.pro ? 'yes' : 'no' }}{{ a.billing.proProductId ? ' · ' + a.billing.proProductId : '' }}</span>
            <span>Expires</span><span>{{ when(a.billing.proExpiresAt) }}{{ a.billing.willRenew ? ' · renews' : '' }}</span>
            <span>Trial ends</span><span>{{ when(a.billing.trialEndsAt) }}</span>
            <span>PRO ended</span><span>{{ when(a.billing.proEndedAt) }}</span>
            <span>Billing issue</span><span [class.text-danger]="a.billing.billingIssueAt">{{ when(a.billing.billingIssueAt) }}{{ a.billing.billingHold ? ' · on hold' : '' }}</span>
            <span>Pending switch</span><span>{{ a.billing.pendingProductId ? a.billing.pendingProductId + ' at ' + when(a.billing.pendingSwitchAt) : '—' }}</span>
            <span>Lifetime</span><span>{{ when(a.billing.lifetimeAt) }}</span>
            <span>Last event</span><span>{{ when(a.billing.billingEventAt) }}</span>
          </div>
        </div>

        <div class="card p-5">
          <div class="lbl">Consent &amp; region</div>
          <div class="kv mt-3">
            <span>Terms</span><span>v{{ a.consent.termsVersion ?? '—' }} · {{ when(a.consent.termsAcceptedAt) }}</span>
            <span>Privacy</span><span>v{{ a.consent.privacyVersion ?? '—' }}</span>
            <span>Age confirmed</span><span>{{ when(a.consent.ageConfirmedAt) }}</span>
            <span>Region</span><span>{{ a.consent.regionValue ?? '—' }}{{ a.consent.regionSource ? ' (' + a.consent.regionSource + ')' : '' }}{{ a.consent.regionEu === true ? ' · EU' : a.consent.regionEu === false ? ' · non-EU' : '' }}</span>
          </div>
          <div class="lbl mt-5">Reports about this user · {{ a.reports.length }}</div>
          <div class="mt-2 divide-y divide-line">
            @for (r of a.reports; track $index) {
              <a class="flex items-center gap-3 py-2 text-[13px]" [routerLink]="['/reports', r.targetType, r.targetId]">
                <span class="tag tag-plain">{{ r.targetType }}</span>
                <span class="flex-1 truncate">{{ r.reason ?? 'No reason' }}<span class="text-mute"> · by {{ r.reporter?.displayName ?? 'image check' }}</span></span>
                <span class="text-mute whitespace-nowrap">{{ ago(r.createdAt) }}</span>
              </a>
            } @empty {
              <div class="py-2 text-[13px] text-mute">None.</div>
            }
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div class="card p-5">
          <div class="lbl">Goals · {{ a.goals.length }}</div>
          @for (g of a.goals; track g.id) {
            <div class="mt-3 pt-3 border-t border-line first:border-0 first:pt-0">
              <div class="flex items-center gap-2 font-bold">
                <span>{{ g.path }} · {{ g.metricLabel ?? g.metric }}</span>
                <span class="text-mute font-semibold">{{ num(g.startValue) }} → {{ num(g.goalValue) }} {{ g.unit }} · now {{ num(g.currentValue) }}</span>
                <span class="tag ml-auto" [class.tag-ok]="g.active" [class.tag-plain]="!g.active">{{ g.active ? 'Active' : 'Ended ' + day(g.endedAt) }}</span>
              </div>
              <table class="tbl mt-2">
                <thead><tr><th>#</th><th>Target</th><th>Reward</th><th>Status</th><th>Deadline</th><th>Check</th><th>Visibility</th></tr></thead>
                <tbody>
                  @for (c of g.checkpoints; track c.id) {
                    <tr>
                      <td class="num">{{ c.index }}</td>
                      <td class="num">{{ num(c.targetValue) }} {{ g.unit }}</td>
                      <td class="text-mute">{{ c.rewardTitle ?? '—' }}</td>
                      <td><span class="tag" [class.tag-ok]="c.status === 'CLEARED'" [class.tag-cyan]="c.status === 'ACTIVE'" [class.tag-gold]="c.status === 'PENDING_VERIFICATION'" [class.tag-plain]="c.status === 'LOCKED'">{{ c.status }}</span>{{ c.clearedAt ? ' ' + day(c.clearedAt) : '' }}</td>
                      <td class="text-mute">{{ c.deadline ?? '—' }}</td>
                      <td class="text-mute">{{ c.verification }}</td>
                      <td class="text-mute">{{ c.visibility }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @empty {
            <div class="mt-2 text-[13px] text-mute">No goal yet.</div>
          }
        </div>

        <div class="card p-5">
          <div class="lbl">Quests · {{ a.quests.length }}</div>
          <table class="tbl mt-3">
            <thead><tr><th>Quest</th><th>Proof</th><th>Days</th><th>Per day</th><th>Target</th><th>State</th></tr></thead>
            <tbody>
              @for (q of a.quests; track q.id) {
                <tr [class.opacity-50]="!q.active">
                  <td><div class="font-bold">{{ q.name }}</div><div class="text-[12px] text-mute">{{ q.code ?? 'custom' }} · {{ q.group }}</div></td>
                  <td class="text-mute">{{ q.proof }}</td>
                  <td class="text-mute">{{ q.days.length === 7 ? 'every day' : q.days.join(' ') }}</td>
                  <td class="num">{{ q.perDay }}</td>
                  <td class="num">{{ q.target ?? '—' }}</td>
                  <td><span class="tag" [class.tag-ok]="q.active" [class.tag-plain]="!q.active">{{ q.active ? 'Active' : 'Inactive' }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="text-mute">No quests.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-5 mt-4">
        <div class="flex items-center gap-3">
          <div class="lbl flex-1">Daily logs</div>
          @for (r of ranges; track r) {
            <button class="btn btn-ghost btn-sm" [class.on]="range() === r" (click)="setRange(r)">{{ r }} days</button>
          }
        </div>
        @if (days(); as list) {
          <table class="tbl mt-3">
            <thead><tr><th>Day</th><th>Done</th><th>Weight</th><th>Quests</th><th>Slip-ups</th></tr></thead>
            <tbody>
              @for (d of list; track d.day) {
                <tr>
                  <td class="whitespace-nowrap font-bold">{{ d.day }}</td>
                  <td class="num whitespace-nowrap">
                    @if (d.totalCount !== null) {
                      <span [class.text-ok]="d.doneCount !== null && d.doneCount >= d.totalCount && d.totalCount > 0">{{ d.doneCount }} / {{ d.totalCount }}</span>
                      @if (d.proClearedAt) { <span class="tag tag-pro ml-1">PRO cleared</span> }
                    } @else { <span class="text-mute">—</span> }
                  </td>
                  <td class="num whitespace-nowrap">
                    {{ d.weight === null ? '—' : num(d.weight) + ' kg' }}
                    @if (d.weighInPhotoUrl) { <a [href]="d.weighInPhotoUrl" target="_blank" class="text-accent2 ml-1">photo</a> }
                  </td>
                  <td>
                    <div class="flex flex-wrap gap-1.5">
                      @for (c of d.completions; track c.id) {
                        <span class="chip" [title]="c.summary ?? ''">
                          <span class="tag" [class.tag-ok]="c.status === 'DONE'" [class.tag-gold]="c.status === 'PENDING'" [class.tag-plain]="c.status === 'TODO'">{{ c.status }}</span>
                          {{ c.questName }}{{ c.slot > 1 ? ' #' + c.slot : '' }}{{ c.value !== null ? ' · ' + num(c.value) : '' }}{{ c.reps !== null ? ' · ' + c.reps + ' reps' : '' }}
                          @if (c.proofStatus) { <span class="text-mute">· proof {{ c.proofStatus }}</span> }
                          @if (c.photoUrl) { <a [href]="c.photoUrl" target="_blank" class="text-accent2">photo</a> }
                        </span>
                      } @empty { <span class="text-mute">—</span> }
                    </div>
                  </td>
                  <td>
                    <div class="flex flex-wrap gap-1.5">
                      @for (s of d.slipUps; track $index) { <span class="chip" [title]="s.note ?? ''">{{ s.type }}</span> } @empty { <span class="text-mute">—</span> }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="text-mute">Nothing logged in this range.</td></tr>
              }
            </tbody>
          </table>
        } @else {
          <div class="skeleton h-[120px] mt-3"></div>
        }
      </div>
    } @else {
      <div class="mt-4"><adm-loading /></div>
    }
  `
})
export class UserPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(Session);
  private readonly toast = inject(Toast);

  readonly id = input.required<string>();
  protected readonly account = signal<Account | null>(null);
  protected readonly days = signal<DayView[] | null>(null);
  protected readonly missing = signal(false);
  protected readonly busy = signal(false);
  protected readonly range = signal<number>(RANGES[0]);
  protected readonly ranges = RANGES;
  protected readonly self = computed(() => this.id() === this.session.user()?.id);
  protected readonly ago = ago;
  protected readonly day = day;
  protected readonly when = when;
  protected readonly num = num;

  ngOnInit(): void {
    void this.load();
    void this.loadDays();
  }

  protected setRange(days: number): void {
    this.range.set(days);
    void this.loadDays();
  }

  protected async resetProfile(): Promise<void> {
    if (confirm('Reset this profile? The name, handle, bio and photo are replaced and the photo file is deleted.')) {
      await this.run(() => this.api.resetProfile(this.id()), 'Profile reset.');
    }
  }

  protected async suspend(): Promise<void> {
    if (confirm('Suspend this account? They can no longer use DropZone and their content is hidden from everyone.')) {
      await this.run(() => this.api.suspendUser(this.id()), 'Account suspended.');
    }
  }

  protected async unsuspend(): Promise<void> {
    if (confirm('Unsuspend this account?')) await this.run(() => this.api.unsuspendUser(this.id()), 'Account unsuspended.');
  }

  private async load(): Promise<void> {
    try {
      this.account.set(await this.api.account(this.id()));
    } catch (e) {
      if ((e as { status?: number }).status === 404) this.missing.set(true);
      else this.toast.error(e);
    }
  }

  private async loadDays(): Promise<void> {
    this.days.set(null);
    try {
      this.days.set(await this.api.days(this.id(), rangeFrom(this.range())));
    } catch (e) {
      this.toast.error(e);
      this.days.set([]);
    }
  }

  private async run(fn: () => Promise<unknown>, done: string): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
      this.toast.show(done);
      await this.load();
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
