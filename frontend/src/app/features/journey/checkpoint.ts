import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Checkpoint, CheckpointSocial, Goal, ProofView } from '../../core/api/models';
import { proofBadge } from '../../core/ai-check';
import { ProofService } from '../../core/proof.service';
import { SessionStore } from '../../core/session.store';
import { GoalStore } from '../../core/stores';
import { ThemeService } from '../../core/theme.service';
import { UnitsService } from '../../core/units';
import { ToastService } from '../../core/toast.service';
import { Badge, BadgeTone } from '../../ui/badge';
import { Icon } from '../../ui/icon';
import { PendingActions } from '../../ui/pending-actions';
import { ReportedFlag } from '../../ui/reported-flag';
import { UnsplashCredit } from '../../ui/unsplash-credit';
import { effectiveVerification } from './goal-plan';
import { cpTitle, delta, pad, rewardName, shortDate, targetLabel, toGo } from './journey.util';
import { PeopleRow } from './people-row';
import { visibilityIcon, visibilityOf } from './visibility';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Badge, PeopleRow, UnsplashCredit, PendingActions, ReportedFlag],
  template: `
    <div class="screen relative bg-bg">
      @if (data(); as d) {
        <div class="absolute inset-x-0 top-0" [style.height.px]="neon() ? 340 : 390">
          @if (d.cp.rewardImageUrl) {
            <img class="ph" [src]="d.cp.rewardImageUrl" alt="">
            @if (d.cp.rewardImageCredit) {
              <p class="absolute right-3 top-[64px] z-[2] glass rounded-[8px] px-2 py-1 text-[10.5px] text-ink/80"><app-unsplash-credit [credit]="d.cp.rewardImageCredit" /></p>
            }
          } @else {
            <div class="w-full h-full flex flex-col items-center justify-center gap-3 pb-10" style="background: radial-gradient(circle at 50% 38%, rgba(var(--accent-rgb), .45), transparent 62%), linear-gradient(160deg, var(--s3), var(--bg))">
              <span class="text-ink/40"><app-icon name="gift" [size]="56" /></span>
              <a class="btn btn-white btn-sm !w-auto px-5 relative z-[2]" [routerLink]="['/journey', d.cp.id, 'edit']"><app-icon name="upload" [size]="16" />Upload reward photo</a>
            </div>
          }
          <div class="absolute inset-0" style="background: linear-gradient(180deg, color-mix(in srgb, var(--bg) 55%, transparent) 0%, transparent 25%, color-mix(in srgb, var(--bg) 35%, transparent) 55%, color-mix(in srgb, var(--bg) 90%, transparent) 80%, var(--bg) 94%)"></div>
        </div>

        <div class="relative pad pt-3 flex items-center justify-between">
          <a class="circ glass" routerLink="/journey" aria-label="Back"><app-icon name="back" /></a>
          <div class="flex gap-2">
            <a class="chip glass" style="padding:8px 11px" [routerLink]="['/journey', d.cp.id, 'edit']" data-test="visibility">
              @let vis = visibility(d.cp);
              <app-icon [name]="visIcon(vis)" />{{ vis === 'EVERYONE' ? 'EVERYONE' : vis === 'FRIENDS' ? 'FRIENDS' : 'PRIVATE' }}
              @if (vis !== 'PRIVATE') { <app-icon name="crown" [size]="12" class="text-gold" /> }
            </a>
            <a class="circ glass" [routerLink]="['/journey', d.cp.id, 'edit']" aria-label="Edit milestone reward"><app-icon name="edit" /></a>
          </div>
        </div>

        <div class="relative pad flex items-end gap-3" [style.margin-top.px]="neon() ? 156 : 206">
          @if (neon()) {
            <app-badge [class.pulse]="d.cp.status === 'ACTIVE'" [tone]="badge(d.cp).tone" [size]="54" [icon]="badge(d.cp).icon" [text]="badge(d.cp).text" [glowing]="d.cp.status !== 'LOCKED'" />
          }
          <div class="pb-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="lbl" style="color: var(--accent-light)">Milestone {{ pad(d.cp.index) }} / {{ pad(d.total) }}</span>
              @switch (d.cp.status) {
                @case ('CLEARED') { <span class="tag tag-free"><app-icon name="check" />Cleared{{ d.cp.clearedAt ? ' · ' + short(d.cp.clearedAt) : '' }}</span> }
                @case ('PENDING_VERIFICATION') { <span class="tag tag-pro"><app-icon name="hourglass" />Verifying</span> }
                @case ('LOCKED') { <span class="tag tag-plain"><app-icon name="lock" />Locked</span> }
              }
              @if (d.cp.overdue) { <span class="tag tag-accent" data-test="overdue"><app-icon name="cal" />Overdue</span> }
            </div>
            @if (d.cp.moderation) { <div class="mt-2"><app-reported-flag [state]="d.cp.moderation" /></div> }
            @if (reward(d.cp); as r) {
              <div class="lbl mt-2 flex items-center gap-1.5 text-gold"><app-icon name="gift" [size]="13" />Reward</div>
              <div class="h mt-1 break-words" [class]="neon() ? 'text-[32px]' : 'text-[42px]'">{{ r }}</div>
            } @else {
              <a class="h mt-2 block break-words" style="color: var(--accent-light)" [class]="neon() ? 'text-[30px]' : 'text-[38px]'" [routerLink]="['/journey', d.cp.id, 'edit']">+ Add a reward</a>
            }
          </div>
        </div>

        <div class="relative pad mt-4 grid grid-cols-2 gap-2.5">
          <div class="card p-3">
            @let seenBy = visibility(d.cp);
            <div class="lbl flex items-center gap-1.5" data-test="seen-by">
              @if (seenBy === 'PRIVATE') {
                <app-icon name="lock" [size]="13" />Private
              } @else {
                <app-icon [name]="visIcon(seenBy)" [size]="13" />{{ seenBy === 'EVERYONE' ? 'Everyone sees' : 'Friends see' }}<app-icon name="crown" [size]="12" class="text-gold" />
              }
            </div>
            <div class="num text-[28px] leading-none mt-2 uppercase">{{ delta(d.g, d.cp.deltaToEarn) }}</div>
            <div class="text-[12px] text-mute mt-1">to earn this</div>
          </div>
          <div class="card p-3">
            <div class="lbl flex items-center gap-1.5"><app-icon name="eyeoff" [size]="13" />Only you</div>
            <div class="num text-[28px] leading-none mt-2 uppercase">{{ u.fmt(d.cp.targetValue, d.g.unit) }} {{ u.label(d.g.unit) }}</div>
            <div class="text-[12px] text-mute mt-1">{{ target(d.g) }}</div>
          </div>
        </div>

        <div class="relative pad mt-3.5">
          <div class="flex justify-between items-baseline mb-2 uppercase">
            <span class="num text-[15px]">{{ u.fmt(achieved(d.g, d.cp), d.g.unit) }} / {{ u.fmt(d.cp.deltaToEarn, d.g.unit) }} {{ u.label(d.g.unit) }}</span>
            @if (left(d.g, d.cp) > 0 && d.cp.status !== 'CLEARED') {
              <span class="num text-[15px] text-accent">{{ u.fmt(left(d.g, d.cp), d.g.unit) }} {{ u.label(d.g.unit) }} to go</span>
            } @else {
              <span class="num text-[15px] text-ok">Reached</span>
            }
          </div>
          <div class="bar" [class.ok]="d.cp.status === 'CLEARED'"><i [style.width.%]="d.cp.status === 'CLEARED' ? 100 : pct(d.g, d.cp)"></i></div>
        </div>

        @if (d.cp.status === 'CLEARED' || d.cp.status === 'PENDING_VERIFICATION') {
          @if (!pro() || social()?.hypes?.count) {
            <div class="relative mx-5 mt-3.5 card px-3.5 h-[52px] flex items-center">
              <app-people-row class="flex-1" [people]="social()?.hypes ?? null" text="hyped your drop" [pro]="pro()" icon="bolt" />
            </div>
          }
        } @else if (!pro() || social()?.alsoChasing?.count) {
          <div class="relative mx-5 mt-3.5 card px-3.5 h-[52px] flex items-center">
            <app-people-row class="flex-1" [people]="social()?.alsoChasing ?? null" [text]="'also chasing milestone ' + d.cp.index" [pro]="pro()" />
          </div>
        }

        <div class="relative mx-5 mt-3.5 card p-3 flex items-center gap-3">
          @if (verification(d.cp) === 'AI') {
            <div class="qi" style="background: rgba(var(--accent-2-rgb), .12); color: var(--accent-2)"><app-icon name="ai" /></div>
            <div class="flex-1 min-w-0">
              @if (d.cp.status === 'CLEARED') {
                <div class="font-bold text-[15px] leading-tight" data-test="proof-badge">{{ proofBadge(d.cp.aiChecked) }}</div>
                <div class="text-[12px] text-mute mt-0.5">{{ d.cp.aiChecked ? 'The AI check recognised your proof photo' : "The AI check didn't recognise it, so it counts as a photo proof" }}</div>
              } @else {
                <div class="font-bold text-[15px] leading-tight">AI check</div>
                <div class="text-[12px] text-mute mt-0.5">{{ visibility(d.cp) !== 'PRIVATE' ? 'Instant · your scale photo stays private' : 'Instant, private' }}</div>
              }
            </div>
          } @else {
            <div class="qi" style="background: rgba(var(--accent-rgb), .14); color: var(--accent-light)"><app-icon name="users" /></div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-[15px] leading-tight flex items-center gap-1.5">Community<app-icon name="crown" [size]="12" class="text-gold" /></div>
              <div class="text-[12px] text-mute mt-0.5">{{ d.cp.requiredVerifications || 3 }} verifies {{ visibility(d.cp) === 'EVERYONE' ? 'from anyone' : 'from your friends' }} · Your scale photo is shown to the people who verify it</div>
            </div>
          }
          <a class="text-right" [routerLink]="['/journey', d.cp.id, 'edit']">
            <div class="chip uppercase"><app-icon name="cal" class="text-mute" />{{ d.cp.deadline ? short(d.cp.deadline) : 'Add' }}</div>
            <div class="text-[10px] mt-1" [class.text-mute]="!d.cp.overdue" [class.text-accent]="d.cp.overdue">{{ d.cp.deadline ? (d.cp.overdue ? 'overdue' : 'deadline') : 'deadline · optional' }}</div>
          </a>
        </div>

        <div class="relative mt-auto pad pt-6" style="padding-bottom: calc(40px + env(safe-area-inset-bottom))">
          @switch (d.cp.status) {
            @case ('ACTIVE') {
              <button class="btn btn-primary" [disabled]="busy()" (click)="proof(d.g, d.cp)"><app-icon name="camera" />I made it · upload proof</button>
            }
            @case ('PENDING_VERIFICATION') {
              <a class="btn btn-gold" [routerLink]="['/journey', d.cp.id, 'proof']"><app-icon name="hourglass" />Proof is live · {{ d.cp.verifiedCount }}/{{ d.cp.requiredVerifications || 3 }}</a>
              <app-pending-actions class="block mt-3" [view]="proofView()" (changed)="onPendingChange($event)" />
            }
            @case ('CLEARED') {
              <a class="btn btn-gold" [routerLink]="['/journey', d.cp.id, 'cleared']"><app-icon name="trophy" />Reward unlocked</a>
            }
            @default {
              <button class="btn btn-ghost" disabled><app-icon name="lock" />Clear milestone {{ pad(d.cp.index - 1) }} first</button>
            }
          }
        </div>
      } @else {
        <div class="skeleton h-[340px] rounded-none"></div>
        <div class="pad -mt-16 space-y-3">
          <div class="skeleton h-[40px] w-2/3"></div>
          <div class="grid grid-cols-2 gap-2.5"><div class="skeleton h-[92px]"></div><div class="skeleton h-[92px]"></div></div>
          <div class="skeleton h-[30px]"></div>
          <div class="skeleton h-[64px]"></div>
        </div>
      }
    </div>
  `
})
export class CheckpointPage {
  private readonly goals = inject(GoalStore);
  private readonly proofs = inject(ProofService);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);

  readonly id = input.required<string>();
  protected readonly pro = this.session.pro;
  protected readonly social = signal<CheckpointSocial | null>(null);

  protected readonly u = inject(UnitsService);
  protected readonly pad = pad;
  protected readonly delta = (g: Goal, v: number) => delta(g, v, this.u.units());
  protected readonly title = cpTitle;
  protected readonly reward = rewardName;
  protected readonly target = targetLabel;
  protected readonly short = shortDate;
  protected readonly left = toGo;
  protected readonly busy = signal(false);
  protected readonly neon = computed(() => this.theme.theme() === 'NEON');
  protected readonly verification = (cp: Checkpoint) => effectiveVerification(cp, this.pro());
  protected readonly visibility = visibilityOf;
  protected readonly visIcon = visibilityIcon;
  protected readonly proofBadge = proofBadge;
  protected readonly proofView = signal<ProofView | null>(null);

  protected readonly data = computed(() => {
    const g = this.goals.goal();
    const cp = g?.checkpoints.find(c => c.id === this.id());
    return g && cp ? { g, cp, total: g.checkpoints.length } : null;
  });
  private readonly pendingProof = computed(() => {
    const cp = this.data()?.cp;
    return cp?.status === 'PENDING_VERIFICATION' ? cp.proofId : null;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (!this.pro()) return;
      void this.api.checkpointSocial(id).then(s => this.social.set(s)).catch(() => undefined);
    });
    effect(() => {
      const proofId = this.pendingProof();
      this.proofView.set(null);
      if (proofId) void this.api.proof(proofId).then(v => this.proofView.set(v)).catch(() => undefined);
    });
    void this.goals.load().then(g => {
      if (g && !g.checkpoints.some(c => c.id === this.id())) {
        this.toast.show('Milestone not found.', true);
        void this.router.navigateByUrl('/journey', { replaceUrl: true });
      } else if (!g && !this.goals.goal()) {
        this.toast.show('Could not load this milestone.', true);
      }
    });
  }

  protected achieved(g: Goal, cp: Checkpoint): number {
    return Math.max(0, Math.min(g.progressValue, cp.deltaToEarn));
  }

  protected pct(g: Goal, cp: Checkpoint): number {
    return cp.deltaToEarn > 0 ? (this.achieved(g, cp) / cp.deltaToEarn) * 100 : 0;
  }

  protected badge(cp: Checkpoint): { tone: BadgeTone; icon: string | null; text: string | null } {
    switch (cp.status) {
      case 'CLEARED': return { tone: 'gold', icon: 'check', text: null };
      case 'ACTIVE': return { tone: 'accent', icon: null, text: pad(cp.index) };
      case 'PENDING_VERIFICATION': return { tone: 'accent', icon: 'hourglass', text: null };
      default: return { tone: 'off', icon: 'lock', text: null };
    }
  }

  protected onPendingChange(v: ProofView): void {
    this.proofView.set(null);
    if (v.status === 'VERIFIED') void this.router.navigate(['/journey', this.id(), 'cleared']);
  }

  protected async proof(g: Goal, cp: Checkpoint): Promise<void> {
    this.busy.set(true);
    try {
      const res = await this.proofs.checkpointProof(g, cp);
      if (res?.status === 'CLEARED') await this.router.navigate(['/journey', cp.id, 'cleared']);
      else if (res?.status === 'PENDING_VERIFICATION') await this.router.navigate(['/journey', cp.id, 'proof']);
    } finally {
      this.busy.set(false);
    }
  }
}
