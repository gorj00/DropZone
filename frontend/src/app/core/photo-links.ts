import { DestroyRef, Injectable, Injector, inject, signal } from '@angular/core';
import { SessionStore } from './session.store';
import { GoalStore, TodayStore } from './stores';

export const EXPIRY_MARGIN_MS = 60_000;
const REFRESH_DELAY_MS = 300;

export function photoKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const q = url.indexOf('?');
  return q < 0 ? url : url.slice(0, q);
}

export function samePhoto(a: string | null | undefined, b: string | null | undefined): boolean {
  return photoKey(a) === photoKey(b);
}

export function signedExpiry(url: string | null | undefined): number | null {
  if (!url || !url.includes('X-Goog-Signature')) return null;
  try {
    const q = new URL(url).searchParams;
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(q.get('X-Goog-Date') ?? '');
    const seconds = Number(q.get('X-Goog-Expires'));
    if (!m || !Number.isFinite(seconds)) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + seconds * 1000;
  } catch {
    return null;
  }
}

export function linkExpired(url: string | null | undefined, now = Date.now()): boolean {
  const end = signedExpiry(url);
  return end !== null && end - EXPIRY_MARGIN_MS <= now;
}

@Injectable({ providedIn: 'root' })
export class PhotoLinks {
  private readonly injector = inject(Injector);
  private readonly seen = new Set<string>();
  private readonly reloaders = new Set<() => unknown>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private installed = false;

  readonly stale = signal(0);

  private readonly onError = (e: Event) => {
    const t = e.target;
    if (t instanceof HTMLImageElement) this.failed(t.currentSrc || t.src);
  };

  install(doc: Document = document): void {
    if (this.installed) return;
    this.installed = true;
    doc.addEventListener('error', this.onError, true);
  }

  failed(src: string | null | undefined, now = Date.now()): boolean {
    if (!src || this.seen.has(src) || !linkExpired(src, now)) return false;
    this.seen.add(src);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), REFRESH_DELAY_MS);
    return true;
  }

  onStale(reload: () => unknown, destroyRef: DestroyRef = inject(DestroyRef)): void {
    this.reloaders.add(reload);
    destroyRef.onDestroy(() => this.reloaders.delete(reload));
  }

  private refresh(): void {
    this.timer = null;
    this.stale.update(n => n + 1);
    const session = this.injector.get(SessionStore);
    const goals = this.injector.get(GoalStore);
    const today = this.injector.get(TodayStore);
    if (session.user()) void session.refresh().catch(() => undefined);
    if (goals.goal()) void goals.load();
    if (today.today()) void today.load().catch(() => undefined);
    for (const reload of this.reloaders) void Promise.resolve().then(reload).catch(() => undefined);
  }
}
