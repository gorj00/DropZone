import { Injectable, InjectionToken, NgZone, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Channel, PermissionStatus, PushNotificationSchema, PushNotifications, PushNotificationsPlugin } from '@capacitor/push-notifications';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';
import { ApiService } from '../api/api.service';
import { openExternal } from '../config.service';
import { isExternal, pushLink } from '../links';
import { SessionStore } from '../session.store';
import { NotificationsStore } from '../social';
import { ToastService } from '../toast.service';

export type PushPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

export interface PushBridge {
  native: boolean;
  plugin: Pick<PushNotificationsPlugin, 'addListener' | 'checkPermissions' | 'requestPermissions' | 'register' | 'createChannel'>;
}

export const PUSH = new InjectionToken<PushBridge>('Push', {
  providedIn: 'root',
  factory: () => ({ native: Capacitor.isNativePlatform(), plugin: PushNotifications })
});

export const APP_SETTINGS = new InjectionToken<{ openNotificationSettings(): Promise<void> }>('AppSettings', {
  providedIn: 'root',
  factory: () => ({
    openNotificationSettings: async () => {
      try {
        await NativeSettings.open({ optionAndroid: AndroidSettings.AppNotification, optionIOS: IOSSettings.AppNotification });
      } catch {
        await NativeSettings.open({ optionAndroid: AndroidSettings.ApplicationDetails, optionIOS: IOSSettings.App });
      }
    }
  })
});

export const PUSH_CHANNELS: Channel[] = [
  { id: 'reminders', name: 'Daily reminders', importance: 3, visibility: 0 },
  { id: 'community', name: 'Community', importance: 3, visibility: 0 },
  { id: 'community-quiet', name: 'Community updates (silent)', importance: 2, visibility: 0 },
  { id: 'account', name: 'Account & billing', importance: 3, visibility: 0 }
];

export const PUSH_ASKED_KEY = 'dz-push-asked';
export const UNREGISTER_TIMEOUT_MS = 5000;
const ACCOUNT_TYPES = ['TRIAL_ENDED', 'BILLING_ISSUE', 'PRO_ENDED', 'PRO_BACK', 'LIFETIME_PRO', 'ACCOUNT_SUSPENDED'];

const toPermission = (s: PermissionStatus): PushPermission => (s.receive === 'granted' ? 'granted' : s.receive === 'denied' ? 'denied' : 'prompt');

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly session = inject(SessionStore);
  private readonly notifications = inject(NotificationsStore);
  private readonly toast = inject(ToastService);
  private readonly bridge = inject(PUSH);
  private readonly appSettings = inject(APP_SETTINGS);
  private started = false;
  private listening: Promise<void> | null = null;
  private token: string | null = null;

  readonly native = this.bridge.native;
  readonly permission = signal<PushPermission>(this.bridge.native ? 'prompt' : 'unavailable');

  constructor() {
    this.session.onClear(() => (this.started = false));
  }

  async start(): Promise<void> {
    if (!this.native || this.started) return;
    this.started = true;
    await this.listen();
    let state = await this.checkPermission();
    if (state === 'prompt' && (await this.firstAsk())) state = await this.request();
    if (state === 'granted') await this.register();
  }

  async enable(): Promise<PushPermission> {
    if (!this.native) return 'unavailable';
    await this.listen();
    let state = await this.checkPermission();
    if (state === 'prompt') state = await this.request();
    if (state === 'granted') await this.register();
    return state;
  }

  async checkPermission(): Promise<PushPermission> {
    if (!this.native) return 'unavailable';
    try {
      this.permission.set(toPermission(await this.bridge.plugin.checkPermissions()));
    } catch { }
    return this.permission();
  }

  async openSettings(): Promise<void> {
    if (this.native) await this.appSettings.openNotificationSettings();
  }

  async unregister(): Promise<void> {
    const token = this.token;
    if (!token || !this.session.token()) return;
    await Promise.race([
      this.api.removePushToken(token).catch(() => undefined),
      new Promise<void>(resolve => setTimeout(resolve, UNREGISTER_TIMEOUT_MS))
    ]);
  }

  received(n: PushNotificationSchema): void {
    if (!this.session.loggedIn()) return;
    void this.notifications.refresh();
    if (ACCOUNT_TYPES.includes(String(n.data?.['type'] ?? ''))) void this.session.refresh().catch(() => undefined);
    const text = n.title || n.body;
    if (text && n.data?.['quiet'] !== '1') this.toast.show(text);
  }

  async open(data: Record<string, unknown> | null | undefined): Promise<void> {
    if (data?.['type'] === 'ACCOUNT_SUSPENDED') await this.session.refresh().catch(() => undefined);
    const link = pushLink(data, this.session.user()?.proProductId);
    if (isExternal(link)) openExternal(link);
    else await this.router.navigateByUrl(link);
  }

  private async firstAsk(): Promise<boolean> {
    if ((await Preferences.get({ key: PUSH_ASKED_KEY })).value) return false;
    await Preferences.set({ key: PUSH_ASKED_KEY, value: '1' });
    return true;
  }

  private async request(): Promise<PushPermission> {
    try {
      this.permission.set(toPermission(await this.bridge.plugin.requestPermissions()));
    } catch { }
    return this.permission();
  }

  private async register(): Promise<void> {
    try { await this.bridge.plugin.register(); } catch { }
  }

  private listen(): Promise<void> {
    this.listening ??= this.addListeners();
    return this.listening;
  }

  private async addListeners(): Promise<void> {
    if (Capacitor.getPlatform() === 'android') {
      for (const channel of PUSH_CHANNELS) await this.bridge.plugin.createChannel(channel).catch(() => undefined);
    }
    await this.bridge.plugin.addListener('registration', t => {
      this.token = t.value;
      if (this.session.token()) void this.api.setPushToken(t.value).catch(() => undefined);
    });
    await this.bridge.plugin.addListener('pushNotificationReceived', n => this.zone.run(() => this.received(n)));
    await this.bridge.plugin.addListener('pushNotificationActionPerformed', a => this.zone.run(() => void this.open(a.notification.data)));
  }
}
