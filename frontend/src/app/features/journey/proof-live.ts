import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api/api.service';
import { ProofPost, ProofView } from '../../core/api/models';
import { PhotoLinks } from '../../core/photo-links';
import { SessionStore } from '../../core/session.store';
import { GoalStore } from '../../core/stores';
import { ToastService } from '../../core/toast.service';
import { UnitsService } from '../../core/units';
import { Avatar, ProTag } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { PendingActions } from '../../ui/pending-actions';
import { ReportedFlag } from '../../ui/reported-flag';
import { UnsplashCredit } from '../../ui/unsplash-credit';
import { proofLink, shareOrCopy } from '../../core/native/share';
import { cpTitle, pad, rewardLabel, sign, verb } from './journey.util';
import { visibilityOf } from './visibility';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Avatar, ProTag, UnsplashCredit, PendingActions, ReportedFlag],
  template: `
    <div class="screen">
      <div class="pad pt-3 h-[62px] flex items-center gap-3">
        <a class="circ" routerLink="/journey" aria-label="Close"><app-icon name="close" /></a>
        @if (cp(); as c) { <div class="lbl" style="color: var(--accent-light)">Milestone {{ pad(c.index) }}</div> }
        <app-pro-tag />
      </div>

      @if (cp(); as c) {
        <div class="pad mt-2">
          <div class="h text-[38px]">Proof is live</div>
          <p class="text-[14px] text-mute mt-1.5">Your reward unlocks after {{ required() }} verifies.</p>
        </div>

        <div class="mx-5 mt-3.5 tcard">
          @if (everyone()) {
            <div class="strip"><span class="flex items-center gap-1.5"><app-icon name="globe" [size]="13" />Public post</span><span>Everyone</span></div>
          } @else {
            <div class="strip"><span class="flex items-center gap-1.5"><app-icon name="users" [size]="13" />Friends only</span><span>Your friends</span></div>
          }
          <div class="h-[200px] relative bg-s2">
            @if (photoUrl(); as p) {
              <img class="ph" [src]="p" alt="">
            } @else {
              <div class="w-full h-full grid place-items-center text-mute"><app-icon name="camera" [size]="40" /></div>
            }
            <span class="chip glass absolute left-3 bottom-3"><app-icon name="camera" />{{ post() ? 'Live photo · ' + time(post()!.createdAt) : 'Proof photo' }}</span>
            @if (photoCredit(); as cr) {
              <p class="absolute right-2 top-2 glass rounded-[8px] px-2 py-1 text-[10.5px] text-ink/80"><app-unsplash-credit [credit]="cr" /></p>
            }
          </div>
          <div class="px-3.5 py-3 flex items-center gap-2.5">
            <app-avatar [url]="user()?.avatarUrl" [name]="user()?.displayName ?? ''" [size]="36" />
            <div class="flex-1 min-w-0 text-[13px] leading-tight">
              <b class="block truncate">{{ firstName() }} {{ verbText() }} {{ amount() }}</b>
              <div class="text-mute truncate">to earn {{ title(c) }}</div>
            </div>
            <span class="num text-accent text-[20px]">{{ signText() }}{{ u.fmt(c.deltaToEarn, goalUnit()) }}</span>
          </div>
        </div>

        <div class="mx-5 mt-3 card p-3.5">
          <div class="flex items-center justify-between">
            <span class="lbl">Verified by</span>
            <span class="num text-[16px]"><span class="text-ok">{{ c.verifiedCount }}</span> / {{ required() }}</span>
          </div>
          <div class="flex items-center gap-3 mt-2.5">
            @for (s of slots(); track $index) {
              @if (s) {
                <div class="relative">
                  <div class="w-11 h-11 rounded-full grid place-items-center bg-s2 text-ok" style="box-shadow: 0 0 0 2px var(--ok)"><app-icon name="user" [size]="20" /></div>
                  <span class="absolute -right-1 -bottom-1 qok" style="width:18px;height:18px"><app-icon name="check" [size]="10" /></span>
                </div>
              } @else {
                <div class="w-11 h-11 rounded-full grid place-items-center num text-[18px] text-mute" style="border: 2px dashed var(--line)">?</div>
              }
            }
            <div class="flex-1 text-[12.5px] text-mute leading-tight ml-1">
              @if (remaining() > 0) {
                {{ remaining() }} more {{ remaining() === 1 ? 'verify' : 'verifies' }},<br>{{ everyone() ? 'from anyone' : 'from your friends' }}
              } @else {
                All verified.<br>Unlocking…
              }
            </div>
          </div>
        </div>

        <div class="mt-auto pad pt-6 space-y-3" style="padding-bottom: calc(40px + env(safe-area-inset-bottom))">
          @if (c.moderation) { <app-reported-flag [state]="c.moderation" /> }
          <button class="btn btn-primary" [disabled]="sharing()" (click)="share()"><app-icon name="share" />Share to get verified</button>
          <app-pending-actions [view]="view()" (changed)="onPendingChange($event)" />
          <a class="btn btn-ghost" routerLink="/journey">Back to journey</a>
        </div>
      } @else {
        <div class="pad mt-2 space-y-3">
          <div class="skeleton h-[40px] w-2/3"></div>
          <div class="skeleton h-[290px]"></div>
          <div class="skeleton h-[96px]"></div>
        </div>
      }
    </div>
  `
})
export class ProofLivePage {
  private readonly goals = inject(GoalStore);
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly u = inject(UnitsService);
  protected readonly pad = pad;
  protected readonly title = rewardLabel;
  protected readonly user = this.session.user;
  protected readonly sharing = signal(false);
  protected readonly view = signal<ProofView | null>(null);
  protected readonly post = computed<ProofPost | null>(() => this.view()?.post ?? null);

  protected readonly cp = computed(() => this.goals.goal()?.checkpoints.find(c => c.id === this.id()) ?? null);
  protected readonly everyone = computed(() => {
    const c = this.cp();
    return !!c && visibilityOf(c) === 'EVERYONE';
  });
  protected readonly required = computed(() => this.cp()?.requiredVerifications || 3);
  protected readonly remaining = computed(() => Math.max(0, this.required() - (this.cp()?.verifiedCount ?? 0)));
  protected readonly slots = computed(() => Array.from({ length: this.required() }, (_, i) => i < (this.cp()?.verifiedCount ?? 0)));
  protected readonly photoUrl = computed(() => this.post()?.photoUrl ?? this.cp()?.rewardImageUrl ?? null);
  protected readonly photoCredit = computed(() => (this.post()?.photoUrl ? null : this.cp()?.rewardImageCredit ?? null));
  protected readonly firstName = computed(() => this.user()?.displayName.split(/\s+/)[0] || 'You');
  protected readonly verbText = computed(() => { const g = this.goals.goal(); return g ? verb(g) : 'dropped'; });
  protected readonly signText = computed(() => { const g = this.goals.goal(); return g ? sign(g) : '−'; });
  protected readonly amount = computed(() => {
    const g = this.goals.goal(), c = this.cp();
    return g && c ? this.u.amount(c.deltaToEarn, g.unit) : '';
  });
  protected readonly goalUnit = computed(() => this.goals.goal()?.unit ?? 'kg');

  private lookedUp = false;

  constructor() {
    void this.goals.load();
    const timer = setInterval(() => {
      const s = this.cp()?.status;
      if (!s || s === 'PENDING_VERIFICATION') void this.goals.load();
    }, 10_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    inject(PhotoLinks).onStale(() => {
      const proofId = this.cp()?.proofId;
      return proofId ? this.findPost(proofId) : undefined;
    });

    effect(() => {
      const c = this.cp();
      if (!c) return;
      if (c.status === 'CLEARED') void this.router.navigate(['/journey', c.id, 'cleared'], { replaceUrl: true });
      else if (c.status === 'ACTIVE' || c.status === 'LOCKED') void this.router.navigate(['/journey', c.id], { replaceUrl: true });
      else if (!this.lookedUp && c.proofId) {
        this.lookedUp = true;
        void this.findPost(c.proofId);
      }
    });
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  protected async share(): Promise<void> {
    const c = this.cp();
    const code = this.user()?.inviteCode;
    if (!c) return;
    this.sharing.set(true);
    const res = await shareOrCopy({
      title: 'Verify my drop on DropZone',
      text: `I hit milestone ${c.index} on DropZone. Verify my proof so I can unlock ${cpTitle(c)}!`,
      url: c.proofId ? proofLink(c.proofId) : code ? `${environment.inviteBaseUrl}${code}` : environment.inviteBaseUrl.replace(/invite\/?$/, '')
    });
    this.sharing.set(false);
    if (res === 'copied') this.toast.show('Link copied. Send it to your friends.');
    else if (res === 'failed') this.toast.show('Could not share right now.', true);
  }

  protected onPendingChange(v: ProofView): void {
    this.view.set(v);
  }

  private async findPost(proofId: string): Promise<void> {
    try {
      this.view.set(await this.api.proof(proofId));
    } catch { }
  }
}
