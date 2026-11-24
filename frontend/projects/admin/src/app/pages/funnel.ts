import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api';
import { ago, when } from '../core/format';
import type { AppEventName, AppEventView, EventCount, Funnel } from '../core/models';
import { Toast } from '../core/toast';
import { Empty, Loading } from '../ui/bits';

interface Step {
  name: AppEventName;
  step?: string;
  label: string;
}

export interface FunnelRow {
  label: string;
  devices: number;
  events: number;
  pct: number;
}

const STEPS: Step[] = [
  { name: 'APP_OPEN', label: 'Opened the app' },
  { name: 'WELCOME_VIEW', label: 'Saw the welcome screen' },
  { name: 'SIGN_IN_TAP', label: 'Tapped sign-in' },
  { name: 'SIGN_IN_OK', label: 'Signed in' },
  { name: 'ONBOARDING_STEP', step: 'profile', label: 'Onboarding · profile' },
  { name: 'ONBOARDING_STEP', step: 'path', label: 'Onboarding · path' },
  { name: 'ONBOARDING_STEP', step: 'goal', label: 'Onboarding · goal' },
  { name: 'ONBOARDING_STEP', step: 'quests', label: 'Onboarding · quests' },
  { name: 'ONBOARDING_STEP', step: 'lock', label: 'Onboarding · app lock' },
  { name: 'ONBOARDING_DONE', label: 'Finished onboarding' }
];

const DROPS: Step[] = [
  { name: 'SIGN_IN_CANCEL', label: 'Cancelled sign-in' },
  { name: 'SIGN_IN_FAIL', label: 'Sign-in failed' }
];

export const EVENT_LABELS: Record<AppEventName, string> = {
  APP_OPEN: 'App opened',
  WELCOME_VIEW: 'Welcome screen',
  SIGN_IN_TAP: 'Sign-in tapped',
  SIGN_IN_CANCEL: 'Sign-in cancelled',
  SIGN_IN_FAIL: 'Sign-in failed',
  SIGN_IN_OK: 'Signed in',
  ONBOARDING_STEP: 'Onboarding step',
  ONBOARDING_DONE: 'Onboarding finished'
};

export const RANGES = [1, 7, 30, 90];

export function funnelRows(counts: EventCount[]): { steps: FunnelRow[]; drops: FunnelRow[] } {
  const find = (s: Step) => counts.find(c => c.name === s.name && (s.step === undefined || c.step === s.step));
  const top = Math.max(1, find(STEPS[0])?.devices ?? 0, ...counts.map(c => c.devices));
  const row = (s: Step): FunnelRow => {
    const c = find(s);
    const devices = c?.devices ?? 0;
    return { label: s.label, devices, events: c?.events ?? 0, pct: Math.round((devices / top) * 100) };
  };
  return { steps: STEPS.map(row), drops: DROPS.map(row) };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Empty, Loading],
  template: `
    <div class="flex items-center gap-3 flex-wrap">
      <h1 class="h text-[30px] flex-1">App funnel</h1>
      @for (d of ranges; track d) {
        <button class="btn btn-sm" [class.btn-primary]="days() === d" [class.btn-ghost]="days() !== d" (click)="pick(d)" [disabled]="loading()">{{ d === 1 ? '24 h' : d + ' days' }}</button>
      }
      <button class="btn btn-ghost btn-sm" (click)="load()" [disabled]="loading()">Refresh</button>
    </div>
    <p class="text-[15px] text-mute mt-2">How many phones reached each step, from opening the app to finishing onboarding. Phones are counted by an anonymous id, with no account or e-mail. Your own test phones are included. Events are kept for 90 days.</p>

    @if (funnel()) {
      <div class="card mt-5 overflow-x-auto">
        <table class="tbl">
          <thead><tr><th>Step</th><th class="r">Phones</th><th class="r">Of opens</th><th class="w-[40%]"></th><th class="r">Events</th></tr></thead>
          <tbody>
            @for (r of rows().steps; track r.label) {
              <tr>
                <td class="font-semibold whitespace-nowrap">{{ r.label }}</td>
                <td class="r num font-bold">{{ r.devices }}</td>
                <td class="r num text-mute">{{ r.pct }}%</td>
                <td><div class="h-[10px] rounded-[5px] bg-[var(--s2)] overflow-hidden"><div class="h-full rounded-[5px] bg-[var(--accent-2)]" [style.width.%]="r.pct"></div></div></td>
                <td class="r num text-mute">{{ r.events }}</td>
              </tr>
            }
            @for (r of rows().drops; track r.label) {
              <tr>
                <td class="whitespace-nowrap"><span class="tag" [class.tag-danger]="r.devices > 0" [class.tag-plain]="r.devices === 0">{{ r.label }}</span></td>
                <td class="r num font-bold" [class.text-danger]="r.devices > 0">{{ r.devices }}</td>
                <td class="r num text-mute">{{ r.pct }}%</td>
                <td></td>
                <td class="r num text-mute">{{ r.events }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (loading()) {
      <div class="mt-5"><adm-loading /></div>
    }

    <div class="flex items-center gap-3 mt-8 flex-wrap">
      <h2 class="h text-[22px] flex-1">Latest events</h2>
      <button class="btn btn-sm" [class.btn-primary]="!failuresOnly()" [class.btn-ghost]="failuresOnly()" (click)="filter(false)">All</button>
      <button class="btn btn-sm" [class.btn-primary]="failuresOnly()" [class.btn-ghost]="!failuresOnly()" (click)="filter(true)">Sign-in failures</button>
    </div>
    @if (events(); as list) {
      @if (list.length) {
        <div class="card mt-4 overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>When</th><th>Event</th><th>Detail</th><th>Phone</th><th>Platform</th><th>Version</th></tr></thead>
            <tbody>
              @for (e of list; track e.id) {
                <tr>
                  <td class="whitespace-nowrap text-mute" [title]="when(e.at)">{{ ago(e.at) }}</td>
                  <td class="whitespace-nowrap"><span class="tag" [class.tag-danger]="e.name === 'SIGN_IN_FAIL'" [class.tag-ok]="e.name === 'SIGN_IN_OK' || e.name === 'ONBOARDING_DONE'" [class.tag-plain]="e.name !== 'SIGN_IN_FAIL' && e.name !== 'SIGN_IN_OK' && e.name !== 'ONBOARDING_DONE'">{{ labels[e.name] }}</span></td>
                  <td class="mono break-all max-w-[480px]">{{ e.detail ?? '' }}</td>
                  <td class="mono text-mute" [title]="e.deviceId">{{ e.deviceId.slice(0, 8) }}</td>
                  <td class="text-mute">{{ e.platform }}</td>
                  <td class="mono text-mute whitespace-nowrap">{{ e.appVersion ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="mt-4"><adm-empty [text]="failuresOnly() ? 'No failed sign-ins in the last 90 days.' : 'No app events yet.'" /></div>
      }
    }
  `
})
export class FunnelPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(Toast);

  protected readonly ranges = RANGES;
  protected readonly labels = EVENT_LABELS;
  protected readonly days = signal(7);
  protected readonly failuresOnly = signal(false);
  protected readonly funnel = signal<Funnel | null>(null);
  protected readonly events = signal<AppEventView[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly rows = computed(() => funnelRows(this.funnel()?.counts ?? []));
  protected readonly ago = ago;
  protected readonly when = when;

  ngOnInit(): void {
    void this.load();
  }

  protected pick(days: number): void {
    this.days.set(days);
    void this.load();
  }

  protected filter(failures: boolean): void {
    this.failuresOnly.set(failures);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [funnel, events] = await Promise.all([
        this.api.funnel(this.days()),
        this.api.appEvents(200, this.failuresOnly() ? 'SIGN_IN_FAIL' : null)
      ]);
      this.funnel.set(funnel);
      this.events.set(events);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.loading.set(false);
    }
  }
}
