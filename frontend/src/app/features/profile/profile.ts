import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Checkpoint, PastGoal, PostVisibility, Stats, Transformation } from '../../core/api/models';
import { AvatarService } from '../../core/avatar.service';
import { PhotoLinks } from '../../core/photo-links';
import { SessionStore } from '../../core/session.store';
import { GoalStore } from '../../core/stores';
import { ThemeService } from '../../core/theme.service';
import { UnitsService } from '../../core/units';
import { Badge, BadgeTone } from '../../ui/badge';
import { BottomNav } from '../../ui/bottom-nav';
import { Icon } from '../../ui/icon';
import { ReportedFlag } from '../../ui/reported-flag';
import { BodyKind, Silhouette } from '../../ui/silhouette';
import { TransformationViewer } from '../../ui/transformation-viewer';
import { longDate } from '../journey/journey.util';

interface Earned {
  name: string;
  icon: string;
  tone: BadgeTone;
  on: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Badge, BottomNav, Icon, Silhouette, TransformationViewer, ReportedFlag],
  template: `
    <div class="screen with-nav relative">
      @if (!theme.isNeon()) {
        <div class="absolute inset-x-0 top-0 h-[260px] pointer-events-none bg-[radial-gradient(circle_at_50%_95%,rgba(var(--accent-rgb),.32),transparent_60%)] [mask-image:linear-gradient(#000_55%,transparent)]"></div>
      }
      <div class="relative pad pt-3 flex justify-end">
        <a class="circ" routerLink="/settings" aria-label="Settings"><app-icon name="sliders" /></a>
      </div>

      @if (user(); as u) {
        <div class="relative flex flex-col items-center -mt-3">
          <button class="relative block" [disabled]="avatar.busy()" aria-label="Change photo" (click)="avatar.change()">
            <div class="rounded-full p-[3px]" [class.opacity-60]="avatar.busy()" [style.width.px]="theme.isNeon() ? 96 : 100" [style.height.px]="theme.isNeon() ? 96 : 100"
              [style.background]="'linear-gradient(135deg, var(--accent), ' + (theme.isNeon() ? 'var(--violet)' : 'var(--gold)') + ')'"
              style="box-shadow: 0 0 30px rgba(var(--accent-rgb), .45)">
              @if (u.avatarUrl && photoFailed() !== u.avatarUrl) {
                <img class="av w-full h-full border-[3px] border-bg" [src]="u.avatarUrl" alt="" (error)="photoFailed.set(u.avatarUrl)">
              } @else {
                <span class="av w-full h-full bg-s2 h !text-[36px] text-ink">{{ initials() }}</span>
              }
            </div>
            @if (theme.isNeon() && level()) {
              <span class="absolute -right-2 -bottom-1"><app-badge tone="violet" [size]="34" [text]="level()" /></span>
            }
            <span class="absolute -left-1 -bottom-0.5 w-[30px] h-[30px] rounded-full grid place-items-center bg-s2 border-2 border-bg text-ink"><app-icon name="camera" [size]="14" /></span>
          </button>
          <button class="text-[12px] font-bold text-mute mt-1.5" [disabled]="avatar.busy()" (click)="avatar.change()">{{ avatar.busy() ? 'Saving…' : 'Change photo' }}</button>
          <div class="h text-[28px] [[data-theme=stealth]_&]:text-[32px] mt-2.5">{{ u.displayName }}</div>
          <div class="text-[13px] text-mute">&#64;{{ u.handle }}</div>
          @if (u.bio) { <p class="text-[13.5px] mt-2 leading-snug max-w-[300px] mx-auto whitespace-pre-line break-words">{{ u.bio }}</p> }
        </div>

        <div class="pad mt-3.5 grid grid-cols-3 gap-2">
          <div class="card py-2.5 text-center !rounded-[14px]">
            <div class="flex items-center justify-center gap-1"><span class="text-accent inline-flex"><app-icon name="flame" [size]="16" /></span><span class="num text-[22px] leading-none">{{ u.streak }}</span></div>
            <div class="lbl mt-1.5 !text-[9.5px]">Day streak</div>
          </div>
          <div class="card py-2.5 text-center !rounded-[14px]">
            <div class="flex items-center justify-center gap-1"><span class="inline-flex" [class.text-accent2]="theme.isNeon()" [class.text-ok]="!theme.isNeon()"><app-icon name="chute" [size]="16" /></span><span class="num text-[22px] leading-none">{{ checkpointLabel() }}</span></div>
            <div class="lbl mt-1.5 !text-[9px] !tracking-[.06em]">Milestone</div>
          </div>
          <div class="card py-2.5 text-center !rounded-[14px]">
            @if (pro()) {
              <div class="flex items-center justify-center gap-1"><span class="inline-flex" [class.text-ok]="theme.isNeon()" [class.text-accent2]="!theme.isNeon()"><app-icon name="check" [size]="16" /></span><span class="num text-[22px] leading-none">{{ stats()?.questsDone ?? '–' }}</span></div>
              <div class="lbl mt-1.5 !text-[9.5px]">Quests</div>
            } @else {
              <div class="flex items-center justify-center gap-1"><span class="inline-flex" [class.text-ok]="theme.isNeon()" [class.text-accent2]="!theme.isNeon()"><app-icon name="trophy" [size]="16" /></span><span class="num text-[22px] leading-none">{{ u.bestStreak }}</span></div>
              <div class="lbl mt-1.5 !text-[9.5px]">Best streak</div>
            }
          </div>
        </div>
        @if (statsFailed()) {
          <div class="mx-5 mt-2 card px-3.5 h-[46px] flex items-center gap-3 !rounded-[14px]">
            <span class="flex-1 text-[13px] text-mute">Couldn't load your stats.</span>
            <button class="qbtn" (click)="loadStats()">Retry</button>
          </div>
        }

        @if (goal(); as g) {
          <a class="mx-5 mt-3 card px-4 py-3 flex items-center gap-3" routerLink="/journey">
            <app-silhouette [kind]="bodies().now" tone="cyan" [height]="84" [scan]="true" [glow]="false" />
            <div class="flex-1 min-w-0">
              <div class="lbl">Your build</div>
              <div class="flex justify-between items-baseline mt-1.5"><span class="num text-[17px]">{{ units.fmt(g.currentValue, g.unit) }}</span><span class="num text-[17px] text-accent">{{ units.fmt(g.goalValue, g.unit) }}</span></div>
              <div class="bar mt-1"><i [style.width.%]="progress()"></i></div>
              <div class="text-[12px] text-mute mt-1.5">{{ units.fmt(g.progressValue, g.unit) }} of {{ units.fmt(g.totalValue, g.unit) }} {{ units.label(g.unit) }} {{ g.path === 'GAIN' ? 'gained' : 'dropped' }}</div>
            </div>
            <app-silhouette [kind]="bodies().goal" tone="accent" [height]="84" />
          </a>
          <div class="mx-5 mt-2 flex justify-end">
            <a class="btn btn-ghost btn-sm !w-auto px-4" routerLink="/goal/edit"><app-icon name="edit" [size]="15" />Edit goal</a>
          </div>

          <div class="pad mt-3.5">
            <div class="lbl mb-2">Reward shelf</div>
            <div class="flex justify-between gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              @for (c of shelf(); track c.id) {
                <a class="relative w-[72px] h-[64px] flex-none rounded-[14px] overflow-hidden grid place-items-center bg-s2" [routerLink]="['/journey', c.id]"
                  [class.border]="c.status !== 'CLEARED'" [class.border-line]="c.status !== 'CLEARED'"
                  [style.box-shadow]="c.status === 'CLEARED' ? '0 0 0 1.5px var(--ok), 0 0 16px -4px rgba(var(--ok-rgb),.6)' : null"
                  [attr.aria-label]="c.rewardTitle || 'Milestone ' + c.index">
                  @if (c.rewardImageUrl) {
                    <img class="ph absolute inset-0" [src]="c.rewardImageUrl" alt="" loading="lazy" [style.filter]="c.status === 'CLEARED' ? null : 'grayscale(1) brightness(.4)'">
                  } @else {
                    <span class="inline-flex" [class.text-ok]="c.status === 'CLEARED'" [class.text-mute]="c.status !== 'CLEARED'"><app-icon name="gift" /></span>
                  }
                  @if (c.status === 'CLEARED') {
                    <span class="absolute right-1.5 bottom-1.5 qok !w-5 !h-5"><app-icon name="check" [size]="11" /></span>
                  } @else if (c.rewardImageUrl) {
                    <span class="absolute inset-0 grid place-items-center text-[#c9c4ef]"><app-icon name="lock" /></span>
                  }
                </a>
              }
            </div>
          </div>
        } @else if (goals.loading()) {
          <div class="mx-5 mt-3 skeleton h-[110px]"></div>
          <div class="mx-5 mt-3.5 skeleton h-[90px]"></div>
        } @else if (goals.error()) {
          <div class="mx-5 mt-3 card p-5 text-center">
            <div class="font-bold">Couldn't load your goal</div>
            <button class="btn btn-ghost btn-sm mx-auto mt-3" (click)="goals.load()"><app-icon name="refresh" />Retry</button>
          </div>
        }

        @if (pastGoals().length) {
          <div class="pad mt-3.5" data-test="past-goals">
            <div class="lbl mb-2">Past goals</div>
            <div class="card divide-y divide-line">
              @for (p of pastGoals(); track p.id) {
                <div class="px-3.5 py-2.5 flex items-center gap-3">
                  <span class="qi !w-[34px] !h-[34px] !rounded-[10px]" [class]="p.reached ? 'bg-[rgba(var(--gold-rgb),.12)] text-gold' : 'bg-s2 text-mute'"><app-icon [name]="p.reached ? 'trophy' : 'flag'" [size]="17" /></span>
                  <span class="flex-1 min-w-0">
                    <span class="block font-bold text-[14px] leading-tight truncate">{{ units.fmt(p.startValue, p.unit) }} → {{ units.fmt(p.goalValue, p.unit) }} {{ units.label(p.unit) }}{{ p.metricLabel ? ' · ' + p.metricLabel : '' }}</span>
                    <span class="block text-[12px] text-mute truncate">{{ pastDates(p) }} · {{ p.milestonesCleared }}/{{ p.milestones }} milestones</span>
                  </span>
                  @if (p.reached) { <span class="tag tag-free">Reached</span> } @else { <span class="tag tag-plain">Ended</span> }
                </div>
              }
            </div>
          </div>
        }

        <div class="pad mt-3.5">
          <div class="lbl mb-2">Badges</div>
          <div class="flex justify-between">
            @for (b of badges(); track b.name) {
              <div class="flex flex-col items-center gap-1 w-[74px] text-center" [class.opacity-50]="!b.on">
                <app-badge [tone]="b.on ? b.tone : 'off'" [size]="46" [icon]="b.icon" [glowing]="b.on" />
                <span class="text-[11px] font-semibold leading-tight" [class.text-mute]="!b.on" [class.opacity-80]="b.on">{{ b.name }}</span>
              </div>
            }
          </div>
        </div>

        <div class="pad mt-4 mb-2">
          <div class="flex items-center justify-between mb-2">
            <div class="lbl">Transformation</div>
            <a class="text-[13px] font-bold text-accent flex items-center gap-1" routerLink="/me/transformations/new"><app-icon name="plus" [size]="15" />Add</a>
          </div>
          <div class="space-y-3">
            @for (t of sets(); track t.id) {
              <div class="card overflow-hidden">
                <app-transformation-viewer [t]="t" [height]="230" />
                @if (t.moderation) {
                  <div class="px-3.5 pt-3"><app-reported-flag [state]="t.moderation" /></div>
                }
                <div class="flex items-center gap-2 px-3.5 h-[48px]">
                  @if (t.removedByModerator && !t.moderation) {
                    <span class="chip !text-accent"><app-icon name="flag" />Removed by a moderator</span>
                  } @else if (!pro() && t.visibility !== 'PRIVATE') {
                    <span class="chip !text-gold"><app-icon name="eyeoff" />Hidden while you're on Free</span>
                  } @else {
                    <span class="chip"><app-icon [name]="visibilityIcon(t.visibility)" />{{ visibilityLabel(t.visibility) }}</span>
                  }
                  @if (t.feedItemId && t.visibility !== 'PRIVATE' && !t.removedByModerator) {
                    <a class="flex items-center gap-1 num text-[15px] text-mute ml-1" [routerLink]="['/post', t.feedItemId]" aria-label="Comments"><app-icon name="comment" [size]="16" />{{ t.commentCount }}</a>
                    <span class="flex items-center gap-1 num text-[15px] text-mute"><span class="inline-flex text-accent"><app-icon name="bolt" [size]="16" /></span>{{ t.hypeCount }}</span>
                  }
                  <a class="ml-auto text-mute p-1" [routerLink]="['/me/transformations', t.id]" aria-label="Edit"><app-icon name="edit" [size]="18" /></a>
                </div>
              </div>
            } @empty {
              @if (setsLoading()) {
                <div class="skeleton h-[200px]"></div>
              } @else if (setsFailed()) {
                <div class="card p-5 text-center">
                  <div class="font-bold">Couldn't load your before & after</div>
                  <button class="btn btn-ghost btn-sm mx-auto mt-3" (click)="loadSets()"><app-icon name="refresh" />Retry</button>
                </div>
              } @else {
                <a class="card p-4 flex items-center gap-3" routerLink="/me/transformations/new">
                  <span class="w-[46px] h-[46px] rounded-[14px] grid place-items-center bg-s2 text-accent flex-none"><app-icon name="split" /></span>
                  <div class="flex-1 min-w-0">
                    <div class="font-bold text-[14.5px]">Add a before & after</div>
                    <div class="text-[12.5px] text-mute">Keep it private or share it with your community.</div>
                  </div>
                  <app-icon name="chev" />
                </a>
              }
            }
          </div>
        </div>
      }
      <app-bottom-nav />
    </div>
  `
})
export class ProfilePage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  protected readonly avatar = inject(AvatarService);
  protected readonly goals = inject(GoalStore);
  protected readonly theme = inject(ThemeService);

  protected readonly units = inject(UnitsService);
  protected readonly user = this.session.user;
  protected readonly pro = this.session.pro;
  protected readonly goal = this.goals.goal;
  protected readonly progress = this.goals.progressPct;
  protected readonly stats = signal<Stats | null>(null);
  protected readonly sets = signal<Transformation[]>([]);
  protected readonly setsLoading = signal(true);
  protected readonly setsFailed = signal(false);
  protected readonly statsFailed = signal(false);
  protected readonly pastGoals = signal<PastGoal[]>([]);

  protected readonly photoFailed = signal<string | null>(null);
  protected readonly initials = computed(() => (this.user()?.displayName ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?');
  protected readonly shelf = computed<Checkpoint[]>(() => [...(this.goal()?.checkpoints ?? [])].sort((a, b) => a.index - b.index));
  protected readonly cleared = computed(() => this.shelf().filter(c => c.status === 'CLEARED').length);
  protected readonly current = computed(() => {
    const list = this.shelf();
    if (!list.length) return 0;
    return this.goals.active()?.index ?? (this.cleared() === list.length ? list.length : 1);
  });
  protected readonly level = computed(() => (this.current() ? String(this.current()) : null));
  protected readonly checkpointLabel = computed(() => (this.shelf().length ? `${this.current()}/${this.shelf().length}` : '–'));
  protected readonly bodies = computed<{ now: BodyKind; goal: BodyKind }>(() =>
    this.goal()?.path === 'GAIN' ? { now: 'slim', goal: 'buff' } : { now: 'now', goal: 'goal' });
  protected readonly badges = computed<Earned[]>(() => {
    const u = this.user();
    const s = this.stats();
    return [
      { name: 'First drop', icon: 'medal', tone: 'gold', on: this.cleared() > 0 },
      { name: '7-day streak', icon: 'flame', tone: 'accent', on: (u?.bestStreak ?? 0) >= 7 },
      { name: 'Trailblazer', icon: 'hike', tone: 'cyan', on: this.progress() >= 50 },
      { name: this.theme.isNeon() ? 'Binge-free' : 'Binge-free week', icon: 'film', tone: 'ok', on: !!u?.pro && !!u.slipUpTracking && (s?.cleanDays ?? 0) >= 7 }
    ];
  });

  constructor() {
    if (!this.goals.goal()) void this.goals.load();
    if (this.pro()) this.loadStats();
    void this.session.refresh().catch(() => undefined);
    this.loadSets();
    void this.api.pastGoals().then(list => this.pastGoals.set(list)).catch(() => undefined);
    inject(PhotoLinks).onStale(() => this.loadSets());
  }

  protected pastDates(p: PastGoal): string {
    const end = p.reachedAt ?? p.endedAt;
    return end ? `${longDate(p.startedAt)} – ${longDate(end)}` : `Since ${longDate(p.startedAt)}`;
  }

  protected loadStats(): void {
    const d = new Date();
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.statsFailed.set(false);
    void this.api.stats(month).then(s => this.stats.set(s)).catch(() => this.statsFailed.set(true));
  }

  protected loadSets(): void {
    this.setsLoading.set(true);
    this.setsFailed.set(false);
    void this.api.transformations().then(list => this.sets.set(list)).catch(() => this.setsFailed.set(true)).finally(() => this.setsLoading.set(false));
  }

  protected visibilityIcon(v: PostVisibility): string {
    return v === 'EVERYONE' ? 'globe' : v === 'FRIENDS' ? 'users' : 'lock';
  }

  protected visibilityLabel(v: PostVisibility): string {
    return v === 'EVERYONE' ? 'EVERYONE' : v === 'FRIENDS' ? 'FRIENDS' : 'PRIVATE';
  }
}
