import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { API_URL } from '../../core/api/api.service';
import { QuestType, User } from '../../core/api/models';
import { authInterceptor } from '../../core/auth';
import { BillingService, PURCHASES } from '../../core/native/billing';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { PaywallPage, mealRow } from './paywall';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const user = (patch: Partial<User> = {}) => ({ id: 'u1', onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [], path: 'LOSE', pro: false, trial: false, trialEndsAt: null, ...patch }) as unknown as User;
const pkg = (id: string, priceString: string, pricePerMonthString: string | null = null) =>
  ({ identifier: id, packageType: 'CUSTOM', product: { identifier: id, priceString, price: 1, currencyCode: 'USD', pricePerMonthString } }) as unknown as PurchasesPackage;
const PACKAGES = [pkg('pro_weekly:w', '$2.99'), pkg('pro_monthly:m', '$8.99'), pkg('pro_yearly:y', '$59.99', '$5.00')];
const withPro = { customerInfo: { entitlements: { active: { pro: {} }, all: {} } } };
const quest = (code: string, path: 'LOSE' | 'GAIN', name: string, free: boolean, multiSlot: boolean) => ({ code, path, name, free, multiSlot }) as QuestType;
const CATALOG = [quest('HEALTHY_MEAL', 'LOSE', 'Healthy meal', true, true), quest('PROTEIN_MEAL', 'GAIN', 'Protein meal', true, true), quest('EXTRA_MEAL', 'GAIN', 'Extra meal', false, true)];

function fakeSdk() {
  return {
    configure: vi.fn().mockResolvedValue(undefined),
    logIn: vi.fn().mockResolvedValue(undefined),
    logOut: vi.fn().mockResolvedValue(undefined),
    getOfferings: vi.fn().mockResolvedValue({ current: { availablePackages: PACKAGES }, all: {} }),
    purchasePackage: vi.fn().mockResolvedValue(withPro),
    restorePurchases: vi.fn().mockResolvedValue({ customerInfo: { entitlements: { active: {}, all: {} } } })
  };
}

async function render(opts: { user?: Partial<User>; apiKey?: string; sdk?: ReturnType<typeof fakeSdk>; legal?: boolean } = {}) {
  const sdk = opts.sdk ?? fakeSdk();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', children: [] }]),
      { provide: LockService, useValue: { native: false, blocked: () => false, disable: vi.fn().mockResolvedValue(undefined) } },
      { provide: PURCHASES, useValue: { native: true, apiKey: opts.apiKey ?? 'goog_test', sdk } }
    ]
  });
  const session = TestBed.inject(SessionStore);
  await session.signIn('tok', user(opts.user));
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(PaywallPage);
  fixture.detectChanges();
  http.match(`${API_URL}/quests/catalog`).forEach(r => r.flush(CATALOG));
  http.match(`${API_URL}/config`).forEach(r => r.flush({
    minVersionCode: 1, termsVersion: '1', privacyVersion: '1', deleteAccountUrl: null,
    termsUrl: opts.legal ? 'https://dropzone.test/terms' : null, privacyUrl: opts.legal ? 'https://dropzone.test/privacy' : null
  }));
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const billing = TestBed.inject(BillingService);
  await vi.waitFor(() => expect(billing.prices()).not.toBe('loading'));
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
  return { fixture, session, sdk, http, el, text, button, settle };
}

describe('mealRow', () => {
  it('names the free multi-meal quests of the path', () => {
    expect(mealRow(CATALOG, 'LOSE')).toMatchObject({ label: 'Pick days, multiple healthy meals a day', freeCheck: true });
    expect(mealRow(CATALOG, 'GAIN').label).toBe('Pick days, multiple protein meals a day');
    expect(mealRow([], 'LOSE').label).toBe('Pick quest days');
  });
});

describe('PaywallPage', () => {
  beforeEach(() => localStorage.clear());

  it('shows the real trial end only during the trial', async () => {
    const ends = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const trial = await render({ user: { pro: true, trial: true, trialEndsAt: ends } });
    expect(trial.text()).toContain('Your free trial ends');
    expect(trial.text()).not.toContain('7-day');
    await trial.session.clear();

    TestBed.resetTestingModule();
    const ended = await render({ user: { pro: false, trial: false, trialEndsAt: null } });
    expect(ended.text()).not.toContain('free trial');
    expect(ended.text()).not.toContain('no card');
    await ended.session.clear();
  });

  it('tells a trial user that subscribing ends the remaining trial days', async () => {
    const ends = new Date(Date.now() + 3 * 86_400_000 - 60_000).toISOString();
    const trial = await render({ user: { pro: true, trial: true, trialEndsAt: ends } });
    const note = trial.el.querySelector('[data-test=trial-billing]');
    expect(note?.textContent?.trim()).toBe('Billing starts today; your remaining 3 trial days end now.');
    expect(note?.nextElementSibling?.textContent?.trim()).toBe('Subscribe');
    await trial.session.clear();

    TestBed.resetTestingModule();
    const free = await render({ user: { pro: false, trial: false, trialEndsAt: null } });
    expect(free.text()).not.toContain('Billing starts today');
    await free.session.clear();
  });

  it('lists the PRO-only rows and the path-aware meal row', async () => {
    const { text, session } = await render();
    expect(text()).toContain('Progress chart & monthly stats');
    expect(text()).toContain('Leaderboard');
    expect(text()).toContain('Pick days, multiple healthy meals a day');
    expect(text()).not.toContain('full stats');
    await session.clear();
  });

  it('shows the subscription terms for the selected plan and the legal links', async () => {
    const { fixture, text, button, settle, session } = await render({ legal: true });
    expect(text()).toContain('$59.99 per year. Renews automatically until you cancel.');
    expect(text()).toContain('Billed to your Google Play account.');
    expect(text()).toContain('Cancel anytime in Google Play › Payments & subscriptions; PRO stays until the end of the paid period.');
    expect(button('Terms of Service')).toBeTruthy();
    expect(button('Privacy Policy')).toBeTruthy();

    [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLButtonElement) => b.textContent?.includes('Weekly'))?.click();
    await settle();
    expect(text()).toContain('$2.99 per week. Renews automatically until you cancel.');
    await session.clear();
  });

  it('hides the legal links until the URLs exist', async () => {
    const { button, session } = await render({ legal: false });
    expect(button('Terms of Service')).toBeUndefined();
    await session.clear();
  });

  it('shows Couldn\'t load prices with a working Retry instead of fallback prices', async () => {
    const sdk = fakeSdk();
    sdk.getOfferings.mockRejectedValueOnce(new Error('offline'));
    const { text, button, settle, session } = await render({ sdk });
    expect(text()).toContain('Couldn\'t load prices');
    expect(text()).not.toContain('$');
    expect((button('Subscribe') as HTMLButtonElement).disabled).toBe(true);

    button('Retry')!.click();
    await vi.waitFor(async () => {
      await settle();
      expect(text()).toContain('$8.99');
    });
    expect(sdk.getOfferings).toHaveBeenCalledTimes(2);
    await session.clear();
  });

  it('welcomes a buyer and closes even when the backend still says Free', async () => {
    const { button, http, session } = await render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const toast = TestBed.inject(ToastService);

    button('Subscribe')!.click();
    (await vi.waitFor(() => http.expectOne(`${API_URL}/billing/refresh`))).flush(user({ pro: false }));
    await vi.waitFor(() => expect(toast.message()?.text).toBe('Welcome to PRO. Every quest is yours.'));
    expect(toast.message()?.error).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/today');
    (await vi.waitFor(() => http.expectOne(`${API_URL}/billing/refresh`))).flush(user({ pro: false }));
    await session.clear();
  });

  it('shows a subscriber their plan, the Play link and a switch', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { text, button, el, settle, sdk, session } = await render({ user: { pro: true, proProductId: 'pro_monthly:m', willRenew: true, proExpiresAt: '2026-11-20T12:00:00Z' } });
    expect(text()).toContain('You\'re PRO');
    expect(text()).toContain('YOUR PLAN');
    expect(button('Subscribe')).toBeUndefined();

    button('Manage in Google Play')!.click();
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/account/subscriptions?sku=pro_monthly&package=com.dropzone.app', '_blank');

    [...el.querySelectorAll('button')].find(b => b.textContent?.includes('Yearly'))!.click();
    await settle();
    expect(text()).toContain('Switches now. Google Play charges $59.99 today and adds your unused Monthly days on top.');
    [...el.querySelectorAll('button')].find(b => b.textContent?.includes('Weekly'))!.click();
    await settle();
    expect(text()).toContain('Switches when your Monthly plan renews on Nov 20, 2026. You keep Monthly until then.');
    [...el.querySelectorAll('button')].find(b => b.textContent?.includes('Yearly'))!.click();
    await settle();
    button('Switch to Yearly')!.click();
    await vi.waitFor(() => expect(sdk.purchasePackage).toHaveBeenCalledWith(expect.objectContaining({ storeProductChangeInfo: { oldProductIdentifier: 'pro_monthly', replacementMode: 'CHARGE_FULL_PRICE' } })));
    open.mockRestore();
    await session.clear();
  });

  it('tells a subscriber when a shorter plan starts and closes', async () => {
    const { button, el, settle, http, session } = await render({ user: { pro: true, proProductId: 'pro_yearly:yearly', willRenew: true, proExpiresAt: '2027-03-01T12:00:00Z' } });
    const toast = TestBed.inject(ToastService);
    [...el.querySelectorAll('button')].find(b => b.textContent?.includes('Weekly'))!.click();
    await settle();
    button('Switch to Weekly')!.click();
    (await vi.waitFor(() => http.expectOne(`${API_URL}/billing/refresh`))).flush(user({ pro: true, proProductId: 'pro_yearly:yearly', willRenew: true, proExpiresAt: '2027-03-01T12:00:00Z' }));
    await vi.waitFor(() => expect(toast.message()?.text).toBe('Your plan switches to Weekly on Mar 1, 2027.'));
    await session.clear();
  });

  it('says no subscription was found for a trial user on restore', async () => {
    const { button, http, session } = await render({ user: { pro: true, trial: true, trialEndsAt: new Date(Date.now() + 86_400_000).toISOString() } });
    const toast = TestBed.inject(ToastService);
    button('Restore purchases')!.click();
    (await vi.waitFor(() => http.expectOne(`${API_URL}/billing/refresh`))).flush(user({ pro: true, trial: true }));
    await vi.waitFor(() => expect(toast.message()?.text).toBe('No subscription found on this Google Play account.'));
    await session.clear();
  });
});
