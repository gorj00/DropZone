import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api/api.service';
import { Checkpoint, Goal, People } from '../../core/api/models';
import { proofBadge } from '../../core/ai-check';
import { SessionStore } from '../../core/session.store';
import { GoalStore } from '../../core/stores';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { UnitsService } from '../../core/units';
import { Icon } from '../../ui/icon';
import { UnsplashCredit } from '../../ui/unsplash-credit';
import { proofLink, shareOrCopy } from '../../core/native/share';
import { cpTitle, delta, pad, rewardLabel, verb } from './journey.util';
import { PeopleRow } from './people-row';
import { visibilityOf } from './visibility';

interface Piece { left: number; top: number; color: string; rot: number; round: boolean; opacity: number; delay: number; dur: number }

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, PeopleRow, UnsplashCredit],
  styles: `
    .rays { position: absolute; left: 50%; width: 260vmax; height: 260vmax; pointer-events: none; animation: spin 90s linear infinite; }
    .confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .confetti i { position: absolute; width: 4px; height: 13px; border-radius: 2px; animation: pop .7s cubic-bezier(.2, 1.4, .4, 1) both, sway var(--dur) ease-in-out infinite alternate; }
    .confetti i.round { width: 6px; height: 6px; border-radius: 50%; }
    .gtext { background: linear-gradient(180deg, #fff 30%, #ffc96b); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 22px rgba(255, 150, 40, .45)); }
    @keyframes spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
    @keyframes pop { from { opacity: 0; translate: 0 40px; scale: .2; } }
    @keyframes sway { from { translate: -4px -6px; } to { translate: 4px 8px; } }
    @media (prefers-reduced-motion: reduce) { .rays, .confetti i { animation: none; } }
  `,
  template: `
    <div class="screen relative overflow-hidden" [style.background]="bg()">
      <div class="rays" [style.top]="neon() ? '24%' : '42%'" [style.background]="rays()" [style.transform]="'translate(-50%, -50%)'"></div>
      <div class="confetti">
        @for (p of pieces(); track $index) {
          <i [class.round]="p.round" [style.left.%]="p.left" [style.top.%]="p.top" [style.background]="p.color" [style.opacity]="p.opacity" [style.rotate.deg]="p.rot" [style.--dur]="p.dur + 's'" [style.animation-delay]="p.delay * 0.3 + 's, ' + p.delay + 's'"></i>
        }
      </div>

      @if (data(); as d) {
        @if (neon()) {
          <div class="relative text-center pt-4">
            <div class="lbl text-ok" style="letter-spacing:.3em">{{ label(d.cp.index, d.total) }}</div>
            <span class="tag mt-1.5" [class]="checkTag(d.cp).cls" data-test="proof-badge">{{ checkTag(d.cp).text }}</span>
          </div>
          <div class="relative mx-auto mt-2" style="width:150px;height:150px">
            <svg viewBox="0 0 150 150" width="150" height="150" style="overflow:visible;filter:drop-shadow(0 0 22px rgba(255,211,77,.55))">
              <defs><linearGradient id="clrGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680" /><stop offset="1" stop-color="#cc8a00" /></linearGradient></defs>
              <g fill="#ffd34d"><path d="M14 40 l2 -6 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2z" /><path d="M132 30 l1.5 -4.5 l1.5 4.5 l4.5 1.5 l-4.5 1.5 l-1.5 4.5 l-1.5 -4.5 l-4.5 -1.5z" /></g>
              <path d="M75 6 L130 25 V72 C130 104 106 125 75 138 C44 125 20 104 20 72 V25Z" fill="url(#clrGold)" stroke="#fff1b8" stroke-width="3" />
              <path d="M75 18 L118 33 V72 C118 97 99 114 75 125 C51 114 32 97 32 72 V33Z" fill="#000" fill-opacity=".14" />
              <path d="M54 66 L68 80 L98 50" fill="none" stroke="#2a1a00" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M2 92 H148 L138 106 L148 120 H2 L12 106Z" style="fill: var(--accent)" stroke="#ffd0e2" stroke-width="2" />
              <text x="75" y="113" text-anchor="middle" font-family="Oswald, sans-serif" font-weight="700" font-size="20" letter-spacing="3" fill="#fff">CLEARED</text>
            </svg>
          </div>
          <div class="relative mx-auto mt-4 w-[270px] tcard" style="border-color: rgba(var(--gold-rgb), .55); box-shadow: 0 24px 50px -18px rgba(255, 180, 40, .55)">
            <div class="strip gold"><span>Reward unlocked</span><span class="flex items-center gap-1"><app-icon name="gift" [size]="13" />{{ pad(d.cp.index) }}</span></div>
            <div class="h-[140px] bg-s2">
              @if (d.cp.rewardImageUrl) { <img class="ph" [src]="d.cp.rewardImageUrl" alt=""> } @else { <div class="w-full h-full grid place-items-center text-gold"><app-icon name="gift" [size]="48" /></div> }
            </div>
            @if (d.cp.rewardImageUrl && d.cp.rewardImageCredit) {
              <p class="px-4 pt-2 text-[10.5px] text-mute"><app-unsplash-credit [credit]="d.cp.rewardImageCredit" /></p>
            }
            <div class="px-4 py-3 flex items-center justify-between gap-3">
              <div class="h text-[20px] min-w-0 break-words">{{ title(d.cp) }}</div>
              <span class="num text-[20px] text-ok uppercase flex-none" style="text-shadow: 0 0 14px rgba(var(--ok-rgb), .6)">{{ delta(d.g, d.cp.deltaToEarn) }}</span>
            </div>
          </div>
        } @else {
          <div class="relative text-center pt-8">
            <div class="lbl text-ok" style="letter-spacing:.3em">{{ label(d.cp.index, d.total) }}</div>
            <div class="h text-[76px] mt-2 gtext">Cleared</div>
            <span class="tag" [class]="checkTag(d.cp).cls" data-test="proof-badge">{{ checkTag(d.cp).text }}</span>
          </div>
          <div class="relative mx-auto mt-6 w-[250px] card-gold overflow-hidden" style="transform: rotate(-3deg); border-radius: 22px; box-shadow: 0 30px 60px -20px rgba(255, 170, 40, .55)">
            <div class="h-[200px] bg-s2">
              @if (d.cp.rewardImageUrl) { <img class="ph" [src]="d.cp.rewardImageUrl" alt=""> } @else { <div class="w-full h-full grid place-items-center text-gold"><app-icon name="gift" [size]="56" /></div> }
            </div>
            @if (d.cp.rewardImageUrl && d.cp.rewardImageCredit) {
              <p class="px-4 pt-2.5 text-[10.5px] text-mute"><app-unsplash-credit [credit]="d.cp.rewardImageCredit" /></p>
            }
            <div class="p-4 flex items-center justify-between gap-2">
              <div class="h text-[24px] min-w-0 break-words">{{ title(d.cp) }}</div>
              <span class="tag tag-free flex-none">Unlocked</span>
            </div>
          </div>
          <div class="relative text-center mt-7">
            <div class="num text-[48px] leading-none text-ok uppercase" style="text-shadow: 0 0 24px rgba(var(--ok-rgb), .5)">{{ delta(d.g, d.g.progressValue) }}</div>
            <div class="lbl mt-1.5">{{ verb(d.g) }} so far</div>
          </div>
        }

        @if (!session.pro() || hypes()?.count) {
          <div class="relative mx-auto mt-4 w-[290px]">
            <app-people-row [people]="hypes()" text="hyped your drop" [pro]="session.pro()" [size]="32" icon="bolt" />
          </div>
        }

        <div class="mt-auto relative px-6 pt-8 space-y-3" style="padding-bottom: calc(40px + env(safe-area-inset-bottom))">
          <button class="btn btn-primary" [disabled]="sharing()" (click)="share()">
            <app-icon name="share" />Share with friends<app-icon name="crown" [size]="15" class="text-gold" />
          </button>
          <a class="btn btn-ghost" routerLink="/journey">{{ shared(d.cp) ? 'Back to journey' : 'Keep it private' }}</a>
        </div>
      } @else {
        <div class="relative pad pt-10 space-y-4">
          <div class="skeleton h-[150px] w-[150px] mx-auto"></div>
          <div class="skeleton h-[220px] w-[270px] mx-auto"></div>
        </div>
      }
    </div>
  `
})
export class ClearedPage {
  private readonly goals = inject(GoalStore);
  protected readonly session = inject(SessionStore);
  private readonly api = inject(ApiService);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly pad = pad;
  protected readonly title = rewardLabel;
  private readonly units = inject(UnitsService);
  protected readonly delta = (g: Goal, v: number) => delta(g, v, this.units.units());
  protected readonly verb = verb;
  protected readonly sharing = signal(false);
  protected readonly hypes = signal<People | null>(null);
  protected readonly neon = computed(() => this.theme.theme() === 'NEON');

  protected readonly data = computed(() => {
    const g = this.goals.goal();
    const cp = g?.checkpoints.find(c => c.id === this.id());
    return g && cp ? { g, cp, total: g.checkpoints.length } : null;
  });

  protected readonly bg = computed(() => this.neon()
    ? 'radial-gradient(circle at 50% 24%, rgba(var(--accent-rgb), .35), transparent 50%), var(--bg)'
    : 'radial-gradient(circle at 50% 42%, rgba(255, 150, 40, .32), transparent 55%), var(--bg)');

  protected readonly rays = computed(() => this.neon()
    ? 'repeating-conic-gradient(from 0deg at 50% 50%, rgba(164, 140, 255, .07) 0deg 7deg, transparent 7deg 14deg)'
    : 'repeating-conic-gradient(from 0deg at 50% 50%, rgba(255, 255, 255, .035) 0deg 7deg, transparent 7deg 14deg)');

  protected readonly pieces = computed<Piece[]>(() => {
    const neon = this.neon();
    let s = neon ? 17 : 11;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const colors = neon ? ['#ff2e7e', '#3dffb5', '#ffd34d', '#ffffff', '#3df0ff', '#8b5cff'] : ['#ff5a1f', '#c6ff3a', '#ffc53d', '#ffffff', '#5cc8ff'];
    return Array.from({ length: 34 }, (_, i) => ({
      left: rnd() * 96,
      top: 4 + rnd() * 70,
      color: colors[i % colors.length],
      opacity: 0.5 + rnd() * 0.5,
      rot: Math.round(rnd() * 360),
      round: rnd() > 0.7,
      delay: Math.round(rnd() * 20) / 10,
      dur: 1.6 + Math.round(rnd() * 20) / 10
    }));
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (!this.session.pro()) return;
      void this.api.checkpointSocial(id).then(s => this.hypes.set(s.hypes)).catch(() => undefined);
    });
    void this.goals.load().then(g => {
      const cp = g?.checkpoints.find(c => c.id === this.id());
      if (g && (!cp || cp.status !== 'CLEARED')) void this.router.navigate(cp ? ['/journey', cp.id] : ['/journey'], { replaceUrl: true });
    });
  }

  protected checkTag(cp: Checkpoint): { text: string; cls: string } {
    if (cp.requiredVerifications > 0) return { text: `Verified by ${cp.requiredVerifications} people`, cls: 'tag tag-free' };
    return { text: proofBadge(cp.aiChecked), cls: cp.aiChecked ? 'tag tag-cyan' : 'tag tag-plain' };
  }

  protected shared(cp: Checkpoint): boolean {
    return visibilityOf(cp) !== 'PRIVATE';
  }

  protected label(index: number, total: number): string {
    return index === total ? 'Final milestone' : `Milestone ${pad(index)}`;
  }

  protected async share(): Promise<void> {
    const d = this.data();
    if (!d) return;
    if (!this.session.pro()) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    const code = this.session.user()?.inviteCode;
    this.sharing.set(true);
    const res = await shareOrCopy({
      title: 'Milestone cleared',
      text: `I just cleared milestone ${d.cp.index} on DropZone: ${this.delta(d.g, d.cp.deltaToEarn)} and earned ${cpTitle(d.cp)}!`,
      url: d.cp.proofId ? proofLink(d.cp.proofId) : code ? `${environment.inviteBaseUrl}${code}` : environment.inviteBaseUrl.replace(/invite\/?$/, '')
    });
    this.sharing.set(false);
    if (res === 'copied') this.toast.show('Link copied. Send it to your friends.');
    else if (res === 'failed') this.toast.show('Could not share right now.', true);
  }
}
