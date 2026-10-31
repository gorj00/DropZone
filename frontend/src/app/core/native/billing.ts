import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CustomerInfo, Purchases, PurchasesPackage, PurchasesPlugin, PurchasesStoreProduct, STORE_REPLACEMENT_MODE } from '@revenuecat/purchases-capacitor';
import { environment } from '../../../environments/environment';
import { ApiService } from '../api/api.service';
import { User } from '../api/models';
import { subscriptionId } from '../config.service';
import { SessionStore } from '../session.store';

export type PlanId = 'pro_weekly' | 'pro_monthly' | 'pro_yearly';
export type BillingPeriod = 'week' | 'month' | 'year';
export type PriceState = 'loading' | 'ready' | 'failed';
export type PurchaseResult = 'done' | 'scheduled' | 'pending' | 'cancelled';
export type SwitchKind = 'now' | 'renewal';

export interface Plan {
  id: PlanId;
  label: string;
  period: BillingPeriod;
  price: string;
  sub: string;
  pkg: PurchasesPackage | null;
}

export interface PurchasesBridge {
  native: boolean;
  apiKey: string;
  sdk: Pick<PurchasesPlugin, 'configure' | 'logIn' | 'logOut' | 'getOfferings' | 'purchasePackage' | 'restorePurchases'>;
}

export const PURCHASES = new InjectionToken<PurchasesBridge>('Purchases', {
  providedIn: 'root',
  factory: () => ({ native: Capacitor.isNativePlatform(), apiKey: environment.revenueCatApiKey, sdk: Purchases })
});

export const ENTITLEMENT = 'pro';
export const PURCHASE_SYNC_DELAYS_MS = [0, 2000, 5000, 10000];

const PLANS: { id: PlanId; label: string; period: BillingPeriod; type: string }[] = [
  { id: 'pro_weekly', label: 'Weekly', period: 'week', type: 'WEEKLY' },
  { id: 'pro_monthly', label: 'Monthly', period: 'month', type: 'MONTHLY' },
  { id: 'pro_yearly', label: 'Yearly', period: 'year', type: 'ANNUAL' }
];

const FALLBACK: Plan[] = [
  { id: 'pro_weekly', label: 'Weekly', period: 'week', price: '$2.99', sub: 'per week', pkg: null },
  { id: 'pro_monthly', label: 'Monthly', period: 'month', price: '$8.99', sub: 'per month', pkg: null },
  { id: 'pro_yearly', label: 'Yearly', period: 'year', price: '$59.99', sub: '$5.00 / mo', pkg: null }
];

export function planOf(productId: string | null | undefined): PlanId | null {
  if (!productId) return null;
  const sub = subscriptionId(productId);
  const exact = PLANS.find(p => p.id === sub);
  if (exact) return exact.id;
  const text = productId.toLowerCase();
  return PLANS.find(p => text.includes(p.period))?.id ?? null;
}

export function switchKind(fromProductId: string | null | undefined, to: PlanId): SwitchKind | null {
  const from = PLANS.findIndex(p => p.id === planOf(fromProductId));
  const target = PLANS.findIndex(p => p.id === to);
  if (from < 0 || from === target) return null;
  return target > from ? 'now' : 'renewal';
}

export function planLabel(productId: string | null | undefined): string | null {
  const id = planOf(productId);
  return PLANS.find(p => p.id === id)?.label ?? null;
}

export function perMonth(product: PurchasesStoreProduct): string {
  if (product.pricePerMonthString) return `${product.pricePerMonthString} / mo`;
  const amount = product.price / 12;
  try {
    return `${new Intl.NumberFormat(undefined, { style: 'currency', currency: product.currencyCode }).format(amount)} / mo`;
  } catch {
    return `${amount.toFixed(2)} ${product.currencyCode} / mo`;
  }
}

export function toPlans(packages: PurchasesPackage[]): Plan[] {
  return PLANS.flatMap(p => {
    const pkg = packages.find(x => subscriptionId(x.product.identifier) === p.id) ?? packages.find(x => x.packageType === p.type);
    if (!pkg) return [];
    const sub = p.period === 'year' ? perMonth(pkg.product) : `per ${p.period}`;
    return [{ id: p.id, label: p.label, period: p.period, price: pkg.product.priceString, sub, pkg }];
  });
}

export function hasPro(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements?.active?.[ENTITLEMENT];
}

export const OTHER_ACCOUNT_MESSAGE = 'This subscription belongs to another DropZone account. Sign in with that account to use it.';
const OTHER_ACCOUNT_CODES = ['7', '13', '40', 'RECEIPT_ALREADY_IN_USE_ERROR', 'RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR', 'PURCHASE_BELONGS_TO_OTHER_USER'];
const ALREADY_PURCHASED_CODES = ['6', 'PRODUCT_ALREADY_PURCHASED_ERROR'];
const NOT_ALLOWED_CODES = ['3', 'PURCHASE_NOT_ALLOWED_ERROR'];
export const PAYMENT_FAILED_MESSAGE = 'The payment didn’t go through. Check your payment method in Google Play and try again.';

function rcCodes(e: unknown): string[] {
  const err = e as { code?: unknown; readableErrorCode?: unknown; userInfo?: { readableErrorCode?: unknown } } | null;
  return [err?.code, err?.readableErrorCode, err?.userInfo?.readableErrorCode].filter(c => c !== undefined && c !== null).map(String);
}

export function isOtherAccountError(e: unknown): boolean {
  return rcCodes(e).some(c => OTHER_ACCOUNT_CODES.includes(c));
}

function isAlreadyPurchased(e: unknown): boolean {
  return rcCodes(e).some(c => ALREADY_PURCHASED_CODES.includes(c));
}

const subscribed = (u: User | null | undefined) => !!u?.pro && !u.trial;
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly bridge = inject(PURCHASES);
  private configured = false;
  private configuredFor: string | null = null;
  private checkedFor: string | null = null;
  private syncing: Promise<void> | null = null;

  readonly enabled = this.bridge.native && !!this.bridge.apiKey;
  readonly plans = signal<Plan[]>(this.enabled ? [] : FALLBACK);
  readonly prices = signal<PriceState>(this.enabled ? 'loading' : 'ready');

  constructor() {
    this.session.onClear(() => this.logOut());
  }

  async init(): Promise<void> {
    const user = this.session.user();
    if (!this.enabled || !user || this.configuredFor === user.id) return;
    this.prices.set('loading');
    try {
      if (this.configured) await this.bridge.sdk.logIn({ appUserID: user.id });
      else await this.bridge.sdk.configure({ apiKey: this.bridge.apiKey, appUserID: user.id });
    } catch (e) {
      this.prices.set('failed');
      throw e;
    }
    this.configured = true;
    this.configuredFor = user.id;
    await this.loadPlans();
  }

  async checkOnStart(): Promise<void> {
    const user = this.session.user();
    if (!user || this.checkedFor === user.id) return;
    this.checkedFor = user.id;
    try {
      const fresh = await this.api.refreshBilling();
      if (this.session.user()?.id === user.id) this.session.setUser(fresh);
    } catch { }
  }

  async retry(): Promise<void> {
    if (!this.enabled) return;
    if (this.configuredFor) await this.loadPlans();
    else await this.init().catch(() => undefined);
  }

  async logOut(): Promise<void> {
    const was = this.configuredFor;
    this.configuredFor = null;
    this.checkedFor = null;
    this.plans.set(this.enabled ? [] : FALLBACK);
    this.prices.set(this.enabled ? 'loading' : 'ready');
    if (!this.enabled || !this.configured || !was) return;
    try { await this.bridge.sdk.logOut(); } catch { }
  }

  async loadPlans(): Promise<void> {
    if (!this.enabled) return;
    this.prices.set('loading');
    try {
      const offerings = await this.bridge.sdk.getOfferings();
      const plans = toPlans(offerings.current?.availablePackages ?? []);
      this.plans.set(plans);
      this.prices.set(plans.length ? 'ready' : 'failed');
    } catch {
      this.plans.set([]);
      this.prices.set('failed');
    }
  }

  async purchase(id: PlanId): Promise<PurchaseResult> {
    const plan = this.plans().find(p => p.id === id);
    if (!this.bridge.native) throw new Error('Purchases are available in the Android app.');
    if (!this.enabled || !plan?.pkg) throw new Error('Subscriptions are not available yet. Try again later.');
    const user = this.session.user();
    const current = subscribed(user) ? subscriptionId(user?.proProductId) : null;
    const kind = current ? switchKind(user?.proProductId, id) : null;
    const mode = kind === 'now' ? STORE_REPLACEMENT_MODE.CHARGE_FULL_PRICE : STORE_REPLACEMENT_MODE.DEFERRED;
    const change = current && kind ? { storeProductChangeInfo: { oldProductIdentifier: current, replacementMode: mode } } : {};
    let info: CustomerInfo;
    try {
      info = (await this.bridge.sdk.purchasePackage({ aPackage: plan.pkg, ...change })).customerInfo;
    } catch (e) {
      const err = e as { userCancelled?: boolean | null; code?: unknown };
      if (err.userCancelled || err.code === '1' || err.code === 1) return 'cancelled';
      if (err.code === '20' || err.code === 20) {
        void this.sync();
        return 'pending';
      }
      if (isOtherAccountError(e)) throw new Error(OTHER_ACCOUNT_MESSAGE);
      if (rcCodes(e).some(c => NOT_ALLOWED_CODES.includes(c))) throw new Error(PAYMENT_FAILED_MESSAGE);
      if (isAlreadyPurchased(e)) {
        try {
          this.session.setUser(await this.api.refreshBilling());
        } catch { }
        if (subscribed(this.session.user())) return 'done';
        throw new Error(OTHER_ACCOUNT_MESSAGE);
      }
      throw e;
    }
    if (kind === 'renewal') {
      try {
        this.session.setUser(await this.api.scheduleSwitch(id));
      } catch { }
      return 'scheduled';
    }
    try {
      this.session.setUser(await this.api.refreshBilling());
    } catch { }
    if (subscribed(this.session.user())) return 'done';
    void this.sync();
    return hasPro(info) ? 'done' : 'pending';
  }

  async restore(): Promise<boolean> {
    let info: CustomerInfo | null = null;
    if (this.enabled) {
      try {
        info = (await this.bridge.sdk.restorePurchases()).customerInfo;
      } catch (e) {
        if (isOtherAccountError(e)) throw new Error(OTHER_ACCOUNT_MESSAGE);
        throw e;
      }
    }
    if (hasPro(info)) {
      void this.sync();
      return true;
    }
    const user = await this.api.refreshBilling();
    this.session.setUser(user);
    return subscribed(user);
  }

  sync(): Promise<void> {
    this.syncing ??= this.syncLoop().finally(() => (this.syncing = null));
    return this.syncing;
  }

  private async syncLoop(): Promise<void> {
    for (const delay of PURCHASE_SYNC_DELAYS_MS) {
      if (delay) await wait(delay);
      if (!this.session.token()) return;
      try {
        const user = await this.api.refreshBilling();
        if (!this.session.token()) return;
        this.session.setUser(user);
        if (subscribed(user)) return;
      } catch { }
      try {
        if (subscribed(await this.session.refresh())) return;
      } catch { }
    }
  }
}
