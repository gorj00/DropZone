import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Health, HealthPlugin, HealthSample } from '@capgo/capacitor-health';
import { openExternal } from '../config.service';
import { DisclosureService } from './disclosure';

export type HealthNeed = 'steps' | 'sleep';
export type HealthAccess = 'granted' | 'denied' | 'not-now' | 'unavailable';

export interface HealthBridge {
  native: boolean;
  plugin: Pick<HealthPlugin, 'isAvailable' | 'requestAuthorization' | 'openHealthConnectSettings' | 'queryAggregated' | 'readSamples'>;
}

export const HEALTH = new InjectionToken<HealthBridge>('Health', {
  providedIn: 'root',
  factory: () => ({ native: Capacitor.isNativePlatform(), plugin: Health })
});

export const HEALTH_RATIONALE_KEY = 'dz-health-rationale';
export const HEALTH_CONNECT_URL = 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';
export const HEALTH_CONNECT_MARKET_URL = 'market://details?id=com.google.android.apps.healthdata';

interface Span { start: number; end: number }

function dayRange(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function union(spans: Span[]): Span[] {
  const sorted = spans.filter(s => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

function length(spans: Span[]): number {
  return spans.reduce((sum, s) => sum + (s.end - s.start), 0);
}

function overlap(a: Span[], b: Span[]): number {
  let total = 0;
  for (const x of a) for (const y of b) total += Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start));
  return total;
}

export function sleepMinutesOf(samples: Pick<HealthSample, 'startDate' | 'endDate' | 'sleepState' | 'stages'>[], from: number, to: number): number {
  const clip = (startDate: string, endDate: string): Span => ({ start: Math.max(from, Date.parse(startDate)), end: Math.min(to, Date.parse(endDate)) });
  const asleep: Span[] = [];
  const awake: Span[] = [];
  for (const s of samples) {
    (s.sleepState === 'awake' ? awake : asleep).push(clip(s.startDate, s.endDate));
    for (const st of s.stages ?? []) if (st.stage === 'awake') awake.push(clip(st.startDate, st.endDate));
  }
  const sleep = union(asleep);
  return Math.round((length(sleep) - overlap(sleep, union(awake))) / 60000);
}

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly bridge = inject(HEALTH);
  private readonly disclosure = inject(DisclosureService);

  readonly native = this.bridge.native;
  readonly authorized = signal(false);

  async available(): Promise<boolean> {
    if (!this.native) return false;
    try { return (await this.bridge.plugin.isAvailable()).available; } catch { return false; }
  }

  async authorize(need?: HealthNeed): Promise<HealthAccess> {
    if (!(await this.available())) return 'unavailable';
    if (!(await this.rationale())) return 'not-now';
    const res = await this.bridge.plugin.requestAuthorization({ read: ['steps', 'sleep'] });
    const granted = res.readAuthorized;
    this.authorized.set(granted.length > 0);
    return (need ? granted.includes(need) : granted.length > 0) ? 'granted' : 'denied';
  }

  async openSettings(): Promise<void> {
    if (this.native) await this.bridge.plugin.openHealthConnectSettings();
  }

  openInstall(): void {
    openExternal(this.native ? HEALTH_CONNECT_MARKET_URL : HEALTH_CONNECT_URL);
  }

  async steps(date: string): Promise<number | null> {
    if (!(await this.available())) return null;
    const { start, end } = dayRange(date);
    try {
      const r = await this.bridge.plugin.queryAggregated({ dataType: 'steps', startDate: start, endDate: end, bucket: 'day', aggregation: 'sum' });
      return Math.round(r.samples.reduce((s, x) => s + (x.value ?? 0), 0));
    } catch {
      return null;
    }
  }

  async sleepMinutes(date: string): Promise<number | null> {
    if (!(await this.available())) return null;
    const end = new Date(`${date}T14:00:00`);
    const start = new Date(end);
    start.setHours(start.getHours() - 24);
    try {
      const r = await this.bridge.plugin.readSamples({ dataType: 'sleep', startDate: start.toISOString(), endDate: end.toISOString(), limit: 200 });
      return sleepMinutesOf(r.samples, start.getTime(), end.getTime());
    } catch {
      return null;
    }
  }

  private async rationale(): Promise<boolean> {
    const { value } = await Preferences.get({ key: HEALTH_RATIONALE_KEY }).catch(() => ({ value: null }));
    if (value) return true;
    const agreed = await this.disclosure.ask('HEALTH');
    if (agreed) await Preferences.set({ key: HEALTH_RATIONALE_KEY, value: '1' }).catch(() => undefined);
    return agreed;
  }
}
