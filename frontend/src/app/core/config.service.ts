import { Injectable, NgZone, inject, signal } from '@angular/core';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ApiService } from './api/api.service';
import { AppConfig } from './api/models';

export const PLAY_PACKAGE = 'com.dropzone.app';
export const PLAY_LISTING_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;
export const PLAY_SUBSCRIPTIONS_URL = `https://play.google.com/store/account/subscriptions?package=${PLAY_PACKAGE}`;

export function subscriptionId(productId: string | null | undefined): string | null {
  const id = productId?.split(':')[0].trim();
  return id || null;
}

export function playSubscriptionsUrl(productId?: string | null): string {
  const sku = subscriptionId(productId);
  return sku ? `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(sku)}&package=${PLAY_PACKAGE}` : PLAY_SUBSCRIPTIONS_URL;
}

export function isUpdateRequired(minVersionCode: number | null | undefined, build: string | number | null | undefined): boolean {
  const installed = typeof build === 'number' ? build : Number.parseInt(build ?? '', 10);
  return typeof minVersionCode === 'number' && Number.isFinite(installed) && installed > 0 && installed < minVersionCode;
}

export function openExternal(url: string): void {
  window.open(url, '_blank');
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly api = inject(ApiService);
  private pending: Promise<AppConfig | null> | null = null;

  readonly config = signal<AppConfig | null>(null);
  readonly updateRequired = signal(false);

  constructor() {
    const zone = inject(NgZone);
    void CapApp.addListener('appStateChange', s => {
      if (s.isActive && !this.config()) zone.run(() => void this.load());
    }).catch(() => undefined);
  }

  load(): Promise<AppConfig | null> {
    this.pending ??= this.fetch().finally(() => (this.pending = null));
    return this.pending;
  }

  private async fetch(): Promise<AppConfig | null> {
    let config: AppConfig;
    try {
      config = await this.api.config();
    } catch {
      return null;
    }
    this.config.set(config);
    if (Capacitor.getPlatform() === 'android') {
      try { this.updateRequired.set(isUpdateRequired(config.minVersionCode, (await CapApp.getInfo()).build)); } catch { }
    }
    return config;
  }
}
