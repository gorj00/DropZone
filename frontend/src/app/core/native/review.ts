import { Injectable, InjectionToken, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AppReview } from '@capawesome/capacitor-app-review';
import { environment } from '../../../environments/environment';
import { IS_IOS } from '../platform';
import { SessionStore } from '../session.store';

export interface ReviewBridge {
  native: boolean;
  ios: boolean;
  appStoreId: string;
  requestReview(): Promise<void>;
  openAppStore(appId?: string): Promise<void>;
}

const GOOGLE_PLAY = 'com.android.vending';

export const REVIEW = new InjectionToken<ReviewBridge>('Review', {
  providedIn: 'root',
  factory: () => ({
    native: Capacitor.isNativePlatform(),
    ios: IS_IOS,
    appStoreId: environment.appStoreId,
    requestReview: () => AppReview.requestReview(),
    openAppStore: appId => AppReview.openAppStore(appId ? { appId } : { androidStorePackageName: GOOGLE_PLAY })
  })
});

export const REVIEW_DELAY_MS = 1200;

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly session = inject(SessionStore);
  private readonly bridge = inject(REVIEW);
  private asking = false;

  readonly canOpenStore = this.bridge.native && (!this.bridge.ios || !!this.bridge.appStoreId);

  async promptOnce(): Promise<void> {
    const user = this.session.user();
    if (!this.bridge.native || this.asking || !user || user.reviewPrompted) return;
    this.asking = true;
    try {
      await this.session.update({ reviewPrompted: true });
    } catch {
      this.asking = false;
      return;
    }
    await new Promise(resolve => setTimeout(resolve, REVIEW_DELAY_MS));
    await this.bridge.requestReview().catch(() => undefined);
    this.asking = false;
  }

  openStore(): Promise<void> {
    return this.bridge.openAppStore(this.bridge.ios ? this.bridge.appStoreId : undefined);
  }
}
