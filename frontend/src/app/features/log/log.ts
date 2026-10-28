import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { DailyLogDetail, FeedItem, ProofView, UserSummary } from '../../core/api/models';
import { PhotoLinks } from '../../core/photo-links';
import { SocialActions } from '../../core/social';
import { ToastService } from '../../core/toast.service';
import { UnitsService } from '../../core/units';
import { Badge } from '../../ui/badge';
import { Avatar } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { PendingActions } from '../../ui/pending-actions';
import { CommentsThread } from '../squad/comments';
import { dayLabel, logTime, logTitle, logValue } from './log-format';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Badge, Icon, CommentsThread, PendingActions],
  template: `
    <div class="screen">
      <div class="pad pt-3 flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="flex-1 min-w-0">
          <div class="lbl">{{ detail() ? when() : 'Daily log' }}</div>
          <div class="h text-[26px] truncate">{{ detail() ? title() : 'Daily log' }}</div>
        </div>
      </div>

      @if (missing()) {
        <div class="pad flex-1 flex flex-col items-center justify-center text-center pb-24">
          <app-badge tone="off" [size]="68" icon="lock" />
          <div class="h text-[26px] mt-5">Log not found</div>
          <p class="text-[14px] text-mute mt-2">It may have been removed.</p>
          <a class="btn btn-ghost mt-6 max-w-[280px]" routerLink="/today">Back to Today</a>
        </div>
      } @else if (detail(); as d) {
        @let l = d.log;
        @if (l.photoUrl) {
          <div class="mx-5 mt-4 card overflow-hidden">
            <div class="h-[320px] relative bg-s2"><img class="ph" [src]="l.photoUrl" alt="Proof photo"></div>
          </div>
        } @else {
          <div class="mx-5 mt-4 card h-[150px] grid place-items-center">
            <span class="w-[64px] h-[64px] rounded-[20px] grid place-items-center bg-[rgba(var(--accent-2-rgb),.12)] text-accent2"><app-icon [name]="l.quest.icon" [size]="30" /></span>
          </div>
        }

        <div class="mx-5 mt-3 card p-4">
          <div class="flex items-center justify-between gap-3">
            @switch (l.status) {
              @case ('DONE') { <span class="chip !text-ok"><app-icon name="check" />Cleared</span> }
              @case ('PENDING') { <span class="chip !text-gold"><app-icon name="hourglass" />Waiting for verifies</span> }
              @default { <span class="chip"><app-icon name="timer" />In progress</span> }
            }
            <span class="text-[12.5px] text-mute">{{ time() }}</span>
          </div>
          @if (value(); as v) { <div class="num text-[34px] leading-none mt-3">{{ v }}</div> }
          @if (l.summary) { <p class="text-[13.5px] text-mute mt-2">{{ l.summary }}</p> }
          @if (d.mlLabels.length) {
            <div class="lbl mt-4">AI saw</div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              @for (m of d.mlLabels; track m) { <span class="chip"><span class="text-accent2 inline-flex"><app-icon name="ai" [size]="12" /></span>{{ m }}</span> }
            </div>
          }
        </div>

        @if (l.requiredVerifications > 0) {
          <div class="mx-5 mt-3 card p-4">
            <div class="flex items-center justify-between">
              <span class="font-bold text-[15px]">Friends check</span>
              <span class="num text-[15px]" [class.text-ok]="l.verifiedCount >= l.requiredVerifications">{{ l.verifiedCount }}/{{ l.requiredVerifications }}</span>
            </div>
            <div class="bar ok mt-2.5 h-[6px]"><i [style.width.%]="verifiedPct()"></i></div>
            @if (d.verifiers.length) {
              <div class="mt-3 space-y-2">
                @for (u of d.verifiers; track u.id) {
                  <div class="flex items-center gap-2.5">
                    <app-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="30" />
                    <span class="font-bold text-[13.5px] flex-1 truncate">{{ u.displayName }}</span>
                    <span class="text-ok inline-flex"><app-icon name="check" [size]="16" /></span>
                    <button class="text-mute p-1" [attr.aria-label]="'More about ' + u.displayName" (click)="userMenu(u)"><app-icon name="more" [size]="16" /></button>
                  </div>
                }
              </div>
            } @else {
              <p class="text-[13px] text-mute mt-2.5">No verifies yet.</p>
            }
            @if (proofView(); as pv) { <app-pending-actions class="block mt-3" [view]="pv" (changed)="onPendingChange($event)" /> }
          </div>
        }

        @if (post(); as p) {
          <div class="mx-5 mt-3 mb-8 card p-4">
            <div class="flex items-center justify-between">
              <span class="lbl">Comments</span>
              <a class="chip" [routerLink]="['/post', p.id]"><span class="text-accent inline-flex"><app-icon name="bolt" [size]="13" /></span>{{ p.hypeCount }} {{ p.hypeCount === 1 ? 'hype' : 'hypes' }}</a>
            </div>
            <div class="mt-3"><app-comments [feedItemId]="p.id" /></div>
          </div>
        } @else {
          <div class="h-8"></div>
        }
      } @else {
        <div class="pad mt-4 space-y-3"><div class="skeleton h-[320px]"></div><div class="skeleton h-[120px]"></div></div>
      }
    </div>
  `
})
export class DailyLogPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly units = inject(UnitsService);
  private readonly location = inject(Location);
  private readonly social = inject(SocialActions);

  readonly id = input.required<string>();

  protected readonly detail = signal<DailyLogDetail | null>(null);
  protected readonly post = signal<FeedItem | null>(null);
  protected readonly proofView = signal<ProofView | null>(null);
  protected readonly missing = signal(false);
  protected readonly title = computed(() => {
    const d = this.detail();
    return d ? logTitle(d.log) : '';
  });
  protected readonly when = computed(() => {
    const d = this.detail();
    return d ? dayLabel(d.log.day) : '';
  });
  protected readonly time = computed(() => {
    const d = this.detail();
    return d ? logTime(d.log.createdAt) : '';
  });
  protected readonly value = computed(() => {
    const d = this.detail();
    return d ? logValue(d.log, this.units) : null;
  });
  protected readonly verifiedPct = computed(() => {
    const l = this.detail()?.log;
    return l && l.requiredVerifications ? Math.min(100, (l.verifiedCount / l.requiredVerifications) * 100) : 0;
  });

  constructor() {
    inject(PhotoLinks).onStale(() => this.load());
  }

  ngOnInit(): void {
    void this.load();
  }

  protected back(): void {
    this.location.back();
  }

  protected onPendingChange(v: ProofView): void {
    this.proofView.set(null);
    if (v.status === 'WITHDRAWN') this.location.back();
    else void this.load();
  }

  protected userMenu(user: UserSummary): void {
    void this.social.userMenu(user);
  }

  private async load(): Promise<void> {
    try {
      const d = await this.api.dailyLog(this.id());
      this.detail.set(d);
      const proofId = d.log.status === 'PENDING' ? d.log.proofId : null;
      if (proofId) void this.api.proof(proofId).then(v => this.proofView.set(v)).catch(() => undefined);
      if (d.log.feedItemId) {
        this.post.set(await this.api.feedItem(d.log.feedItemId).catch(() => null));
      } else {
        this.post.set(null);
      }
    } catch (e) {
      if ((e as { status?: number })?.status === 404) this.missing.set(true);
      else this.toast.error(e);
    }
  }
}
