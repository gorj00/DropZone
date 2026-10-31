import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PurchasesPackage, PurchasesStoreProduct } from '@revenuecat/purchases-capacitor';
import { API_URL } from '../api/api.service';
import { User } from '../api/models';
import { authInterceptor } from '../auth';
import { SessionStore } from '../session.store';
import { BillingService, OTHER_ACCOUNT_MESSAGE, PAYMENT_FAILED_MESSAGE, PURCHASES, PURCHASE_SYNC_DELAYS_MS, perMonth, planLabel, planOf, switchKind, toPlans } from './billing';
import { LockService } from './lock';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const user = (patch: Partial<User> = {}) => ({ id: 'u1', onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [], pro: false, trial: false, ...patch }) as unknown as User;

function product(identifier: string, patch: Partial<PurchasesStoreProduct> = {}): PurchasesStoreProduct {
  return { identifier, priceString: '$8.99', price: 8.99, currencyCode: 'USD', pricePerMonthString: null, ...patch } as unknown as PurchasesStoreProduct;
}

function pkg(identifier: string, patch: Partial<PurchasesStoreProduct> = {}, packageType = 'CUSTOM'): PurchasesPackage {
  return { identifier: `$rc_${identifier}`, packageType, product: product(identifier, patch), offeringIdentifier: 'default' } as unknown as PurchasesPackage;
}

const PACKAGES = [
  pkg('pro_weekly:weekly', { priceString: '$2.99', price: 2.99 }),
  pkg('pro_monthly:monthly', { priceString: '$8.99', price: 8.99 }),
  pkg('pro_yearly:yearly', { priceString: '$59.99', price: 59.99, pricePerMonthString: '$5.00' })
];

const withPro = { customerInfo: { entitlements: { active: { pro: { identifier: 'pro' } }, all: {} } } };
const withoutPro = { customerInfo: { entitlements: { active: {}, all: {} } } };

function fakeSdk(packages: PurchasesPackage[] = PACKAGES) {
  return {
    configure: vi.fn().mockResolvedValue(undefined),
    logIn: vi.fn().mockResolvedValue({ customerInfo: withoutPro.customerInfo, created: false }),
    logOut: vi.fn().mockResolvedValue(withoutPro),
    getOfferings: vi.fn().mockResolvedValue({ current: { availablePackages: packages }, all: {} }),
    purchasePackage: vi.fn().mockResolvedValue(withPro),
    restorePurchases: vi.fn().mockResolvedValue(withoutPro)
  };
}

async function setup(opts: { sdk?: ReturnType<typeof fakeSdk>; apiKey?: string; user?: Partial<User> } = {}) {
  const sdk = opts.sdk ?? fakeSdk();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', children: [] }]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } },
      { provide: PURCHASES, useValue: { native: true, apiKey: opts.apiKey ?? 'goog_test', sdk } }
    ]
  });
  const session = TestBed.inject(SessionStore);
  await session.signIn('tok', user(opts.user));
  return { session, sdk, billing: TestBed.inject(BillingService), http: TestBed.inject(HttpTestingController) };
}

const expect1 = (http: HttpTestingController, method: string, path: string) =>
  vi.waitFor(() => http.expectOne(r => r.method === method && r.url === `${API_URL}${path}`));

describe('plan mapping', () => {
  it('maps packages by subscription id and falls back to the package type', () => {
    const plans = toPlans([pkg('pro_monthly:p1m'), pkg('dropzone_pro:annual', { priceString: '€49.99' }, 'ANNUAL')]);
    expect(plans.map(p => [p.id, p.price])).toEqual([['pro_monthly', '$8.99'], ['pro_yearly', '€49.99']]);
  });

  it('shows the yearly price per month from the store', () => {
    expect(perMonth(product('pro_yearly', { price: 1490, priceString: '1 490,00 Kč', currencyCode: 'CZK', pricePerMonthString: '124,17 Kč' }))).toBe('124,17 Kč / mo');
  });

  it('computes the monthly price in the product currency only when the store has none', () => {
    const text = perMonth(product('pro_yearly', { price: 1490, currencyCode: 'CZK', pricePerMonthString: null }));
    expect(text).toMatch(/124[.,]17/);
    expect(text).toMatch(/CZK|Kč/);
    expect(text).not.toContain('$');
  });

  it('names the plan from proProductId', () => {
    expect(planOf('pro_monthly:monthly')).toBe('pro_monthly');
    expect(planOf('dropzone_pro:yearly')).toBe('pro_yearly');
    expect(planOf(null)).toBeNull();
    expect(planLabel('pro_weekly')).toBe('Weekly');
  });
});

describe('BillingService prices', () => {
  beforeEach(() => localStorage.clear());

  it('loads the offering into plans with store prices', async () => {
    const { billing, session } = await setup();
    expect(billing.prices()).toBe('loading');
    await billing.init();
    expect(billing.prices()).toBe('ready');
    expect(billing.plans().map(p => `${p.label} ${p.price} ${p.sub}`)).toEqual(['Weekly $2.99 per week', 'Monthly $8.99 per month', 'Yearly $59.99 $5.00 / mo']);
    await session.clear();
  });

  it('shows no fallback prices when the offering fails, and retries', async () => {
    const sdk = fakeSdk();
    sdk.getOfferings.mockRejectedValueOnce(new Error('offline'));
    const { billing, session } = await setup({ sdk });
    await billing.init();
    expect(billing.prices()).toBe('failed');
    expect(billing.plans()).toEqual([]);

    await billing.retry();
    expect(billing.prices()).toBe('ready');
    expect(billing.plans()).toHaveLength(3);
    await session.clear();
  });

  it('fails when the offering has none of the plans and shows only the plans it has', async () => {
    const { billing, session } = await setup({ sdk: fakeSdk([]) });
    await billing.init();
    expect(billing.prices()).toBe('failed');

    await session.clear();
    TestBed.resetTestingModule();
    const second = await setup({ sdk: fakeSdk([PACKAGES[1]]) });
    await second.billing.init();
    expect(second.billing.prices()).toBe('ready');
    expect(second.billing.plans().map(p => p.id)).toEqual(['pro_monthly']);
    await second.session.clear();
  });

  it('keeps the fallback list when billing is not configured', async () => {
    const { billing, sdk, session } = await setup({ apiKey: '' });
    await billing.init();
    expect(billing.enabled).toBe(false);
    expect(billing.prices()).toBe('ready');
    expect(billing.plans().map(p => p.price)).toEqual(['$2.99', '$8.99', '$59.99']);
    expect(sdk.configure).not.toHaveBeenCalled();
    await session.clear();
  });
});

describe('BillingService.purchase', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('confirms from customerInfo even when the backend still says Free, and keeps syncing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { billing, session, http } = await setup();
    await billing.init();

    const result = billing.purchase('pro_monthly');
    (await expect1(http, 'POST', '/billing/refresh')).flush(user({ pro: false }));
    expect(await result).toBe('done');

    (await expect1(http, 'POST', '/billing/refresh')).flush(user({ pro: false }));
    (await expect1(http, 'GET', '/me')).flush(user({ pro: false }));
    await vi.advanceTimersByTimeAsync(PURCHASE_SYNC_DELAYS_MS[1]);
    (await expect1(http, 'POST', '/billing/refresh')).flush(user({ pro: true, proProductId: 'pro_monthly:monthly' }));
    await vi.waitFor(() => expect(session.subscribed()).toBe(true));
    await vi.advanceTimersByTimeAsync(PURCHASE_SYNC_DELAYS_MS[2]);
    http.expectNone(`${API_URL}/billing/refresh`);
    await session.clear();
  });

  it('never throws after a confirmed purchase when the refresh fails', async () => {
    const { billing, session, http } = await setup();
    await billing.init();
    const result = billing.purchase('pro_yearly');
    (await expect1(http, 'POST', '/billing/refresh')).flush({ code: 'INTERNAL', message: 'Down' }, { status: 500, statusText: 'Error' });
    expect(await result).toBe('done');
    (await expect1(http, 'POST', '/billing/refresh')).flush({ code: 'INTERNAL', message: 'Down' }, { status: 500, statusText: 'Error' });
    (await expect1(http, 'GET', '/me')).error(new ProgressEvent('error'));
    await session.clear();
  });

  it('returns cancelled without calling the backend', async () => {
    const sdk = fakeSdk();
    sdk.purchasePackage.mockRejectedValueOnce({ code: '1', userCancelled: true, message: 'Cancelled' });
    const { billing, session, http } = await setup({ sdk });
    await billing.init();
    expect(await billing.purchase('pro_monthly')).toBe('cancelled');
    http.expectNone(`${API_URL}/billing/refresh`);
    await session.clear();
  });

  it('rethrows store errors', async () => {
    const sdk = fakeSdk();
    sdk.purchasePackage.mockRejectedValueOnce({ code: '2', message: 'The store is unavailable' });
    const { billing, session } = await setup({ sdk });
    await billing.init();
    await expect(billing.purchase('pro_monthly')).rejects.toMatchObject({ message: 'The store is unavailable' });
    await session.clear();
  });

  it('explains a declined payment instead of the generic not allowed error', async () => {
    const sdk = fakeSdk();
    sdk.purchasePackage.mockRejectedValueOnce({ code: '3', message: 'The device or user is not allowed to make the purchase.', readableErrorCode: 'PURCHASE_NOT_ALLOWED_ERROR' });
    const { billing, session, http } = await setup({ sdk });
    await billing.init();
    await expect(billing.purchase('pro_monthly')).rejects.toMatchObject({ message: PAYMENT_FAILED_MESSAGE });
    http.expectNone(`${API_URL}/billing/refresh`);
    await session.clear();
  });

  it('explains a receipt that belongs to another DropZone account', async () => {
    const sdk = fakeSdk();
    sdk.purchasePackage.mockRejectedValueOnce({ code: '7', message: 'This receipt is already in use.' });
    const { billing, session } = await setup({ sdk });
    await billing.init();
    await expect(billing.purchase('pro_monthly')).rejects.toMatchObject({ message: OTHER_ACCOUNT_MESSAGE });
    await session.clear();
  });

  it('checks the backend when Play says the plan is already bought, else names the other account', async () => {
    const sdk = fakeSdk();
    sdk.purchasePackage.mockRejectedValue({ code: '6', message: 'This product is already active for the user.' });
    const { billing, session, http } = await setup({ sdk });
    await billing.init();
    const mine = billing.purchase('pro_monthly');
    (await expect1(http, 'POST', '/billing/refresh')).flush(user({ pro: true, trial: false }));
    expect(await mine).toBe('done');

    session.setUser(user({ pro: false }));
    const other = billing.purchase('pro_monthly');
    const rejected = expect(other).rejects.toMatchObject({ message: OTHER_ACCOUNT_MESSAGE });
    (await expect1(http, 'POST', '/billing/refresh')).flush(user({ pro: false }));
    await rejected;
    await session.clear();
  });

  it('reports a pending purchase when neither the store nor the backend confirms it', async () => {
    const sdk = fakeSdk();
    sdk.purchasePackage.mockResolvedValueOnce(withoutPro);
    const { billing, session, http } = await setup({ sdk });
    await billing.init();
    const result = billing.purchase('pro_monthly');
    (await expect1(http, 'POST', '/billing/refresh')).flush(user({ pro: false }));
    expect(await result).toBe('pending');
    await session.clear();
  });

  it('switches to a longer plan right away with the full price charged', async () => {
    const { billing, sdk, session, http } = await setup({ user: { pro: true, proProductId: 'pro_monthly:monthly', willRenew: true } });
    await billing.init();
    const result = billing.purchase('pro_yearly');
    (await expect1(http, 'POST', '/billing/refresh')).flush(user({ pro: true, proProductId: 'pro_yearly:yearly' }));
    expect(await result).toBe('done');
    expect(sdk.purchasePackage).toHaveBeenCalledWith(expect.objectContaining({
      aPackage: PACKAGES[2],
      storeProductChangeInfo: { oldProductIdentifier: 'pro_monthly', replacementMode: 'CHARGE_FULL_PRICE' }
    }));
    await session.clear();
  });

  it('schedules a shorter plan for the next renewal', async () => {
    const { billing, sdk, session, http } = await setup({ user: { pro: true, proProductId: 'pro_yearly:yearly', willRenew: true } });
    await billing.init();
    const result = billing.purchase('pro_weekly');
    const req = await expect1(http, 'POST', '/billing/pending-switch');
    expect(req.request.body).toEqual({ productId: 'pro_weekly' });
    req.flush(user({ pro: true, proProductId: 'pro_yearly:yearly', willRenew: true, pendingPlanId: 'pro_weekly', pendingPlanAt: '2027-03-01T12:00:00Z' }));
    expect(await result).toBe('scheduled');
    expect(session.user()?.pendingPlanId).toBe('pro_weekly');
    expect(sdk.purchasePackage).toHaveBeenCalledWith(expect.objectContaining({
      aPackage: PACKAGES[0],
      storeProductChangeInfo: { oldProductIdentifier: 'pro_yearly', replacementMode: 'DEFERRED' }
    }));
    await session.clear();
  });

  it('orders plans weekly < monthly < yearly for switches', () => {
    expect(switchKind('pro_weekly:weekly', 'pro_monthly')).toBe('now');
    expect(switchKind('pro_monthly:monthly', 'pro_yearly')).toBe('now');
    expect(switchKind('pro_yearly:yearly', 'pro_monthly')).toBe('renewal');
    expect(switchKind('pro_monthly:monthly', 'pro_weekly')).toBe('renewal');
    expect(switchKind('pro_monthly:monthly', 'pro_monthly')).toBeNull();
    expect(switchKind(null, 'pro_monthly')).toBeNull();
  });

  it('buys without a change for a trial user', async () => {
    const { billing, sdk, session, http } = await setup({ user: { pro: true, trial: true } });
    await billing.init();
    const result = billing.purchase('pro_monthly');
    (await expect1(http, 'POST', '/billing/refresh')).flush(user({ pro: true, proProductId: 'pro_monthly:monthly' }));
    await result;
    expect(sdk.purchasePackage.mock.calls[0][0]).not.toHaveProperty('storeProductChangeInfo');
    await session.clear();
  });
});

describe('BillingService.restore', () => {
  beforeEach(() => localStorage.clear());

  it('is true when RevenueCat finds the entitlement', async () => {
    const sdk = fakeSdk();
    sdk.restorePurchases.mockResolvedValueOnce(withPro);
    const { billing, session } = await setup({ sdk });
    await billing.init();
    expect(await billing.restore()).toBe(true);
    await session.clear();
  });

  it('explains a subscription that is restored on a second DropZone account', async () => {
    const sdk = fakeSdk();
    sdk.restorePurchases.mockRejectedValueOnce({ code: '7', message: 'This receipt is already in use.', readableErrorCode: 'RECEIPT_ALREADY_IN_USE_ERROR' });
    const { billing, session, http } = await setup({ sdk });
    await billing.init();
    await expect(billing.restore()).rejects.toMatchObject({ message: 'This subscription belongs to another DropZone account. Sign in with that account to use it.' });
    http.expectNone(`${API_URL}/billing/refresh`);
    await session.clear();
  });

  it('is false for a trial user without a purchase', async () => {
    const { billing, session, http } = await setup({ user: { pro: true, trial: true } });
    await billing.init();
    const restored = billing.restore();
    (await expect1(http, 'POST', '/billing/refresh')).flush(user({ pro: true, trial: true }));
    expect(await restored).toBe(false);
    await session.clear();
  });
});

describe('BillingService.checkOnStart', () => {
  beforeEach(() => localStorage.clear());

  it('asks the backend once per account and applies PRO granted outside the app', async () => {
    const { billing, session, http } = await setup();
    const check = billing.checkOnStart();
    (await expect1(http, 'POST', '/billing/refresh')).flush(user({ pro: true, proProductId: 'rc_promo_pro_lifetime' }));
    await check;
    expect(session.subscribed()).toBe(true);

    session.setUser(user());
    await billing.checkOnStart();
    http.expectNone(`${API_URL}/billing/refresh`);
    await session.clear();
  });

  it('checks subscribers too, so a lifetime grant replaces their subscription, and ignores a failed check', async () => {
    const { billing, session, http } = await setup({ user: { pro: true, proProductId: 'pro_monthly:monthly', proExpiresAt: '2226-09-12T07:42:00Z', willRenew: true } });
    const first = billing.checkOnStart();
    (await expect1(http, 'POST', '/billing/refresh')).flush(user({ pro: true, proProductId: 'rc_promo_pro_lifetime', proExpiresAt: null, willRenew: false }));
    await first;
    expect(session.user()?.proProductId).toBe('rc_promo_pro_lifetime');

    session.setUser(user({ id: 'u2' }));
    const check = billing.checkOnStart();
    (await expect1(http, 'POST', '/billing/refresh')).flush({ code: 'INTERNAL', message: 'Down' }, { status: 500, statusText: 'Error' });
    await check;
    expect(session.subscribed()).toBe(false);
    await session.clear();
  });
});
