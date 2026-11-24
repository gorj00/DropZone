import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { App as CapApp } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { filter } from 'rxjs';
import { ApiService } from './api/api.service';
import { apiError } from './api/errors';
import { scrub } from './native/crashlytics';

export type AppEventName =
  | 'APP_OPEN'
  | 'WELCOME_VIEW'
  | 'SIGN_IN_TAP'
  | 'SIGN_IN_CANCEL'
  | 'SIGN_IN_FAIL'
  | 'SIGN_IN_OK'
  | 'ONBOARDING_STEP'
  | 'ONBOARDING_DONE';

export const DEVICE_KEY = 'dz-device';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEP = /^\/onboarding\/([a-z-]{1,20})$/;

export function failureDetail(provider: string, e: unknown): string {
  let text: string;
  if (e instanceof HttpErrorResponse) {
    const err = apiError(e);
    text = `${err.code}: ${err.message}`;
  } else {
    const o = (e ?? {}) as { code?: unknown; message?: unknown };
    const code = typeof o.code === 'string' || typeof o.code === 'number' ? String(o.code) : e instanceof Error ? e.name : 'UNKNOWN';
    text = `${code}: ${typeof o.message === 'string' ? o.message : String(e)}`;
  }
  return scrub(`${provider} ${text}`).slice(0, 300);
}

@Injectable({ providedIn: 'root' })
export class Analytics {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private device: Promise<string> | null = null;
  private version: Promise<string | null> | null = null;

  start(): void {
    this.track('APP_OPEN');
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      const path = e.urlAfterRedirects.split(/[?#]/)[0];
      if (path === '/welcome') this.track('WELCOME_VIEW');
      const step = STEP.exec(path);
      if (step) this.track('ONBOARDING_STEP', step[1]);
    });
  }

  track(name: AppEventName, detail: string | null = null): void {
    void this.send(name, detail).catch(() => undefined);
  }

  private async send(name: AppEventName, detail: string | null): Promise<void> {
    const [deviceId, appVersion] = await Promise.all([this.deviceId(), this.appVersion()]);
    await this.api.trackEvent({ deviceId, name, detail: detail ? detail.slice(0, 300) : null, appVersion });
  }

  private deviceId(): Promise<string> {
    this.device ??= (async () => {
      const { value } = await Preferences.get({ key: DEVICE_KEY });
      if (value && UUID.test(value)) return value;
      const id = crypto.randomUUID();
      await Preferences.set({ key: DEVICE_KEY, value: id });
      return id;
    })();
    return this.device;
  }

  private appVersion(): Promise<string | null> {
    this.version ??= CapApp.getInfo().then(
      info => `${info.version} (${info.build})`.slice(0, 32),
      () => null
    );
    return this.version;
  }
}
