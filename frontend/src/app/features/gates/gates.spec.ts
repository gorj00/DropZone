import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../core/api/api.service';
import { AppConfig, User } from '../../core/api/models';
import { isUpdateRequired } from '../../core/config.service';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { ConsentGate } from './gates';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const user = (consentRequired: boolean) => ({ id: 'u1', onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [], consentRequired }) as unknown as User;
const config = (patch: Partial<AppConfig> = {}): AppConfig => ({
  minVersionCode: 1, termsVersion: '2026-10', privacyVersion: '2026-11', termsUrl: null, privacyUrl: null, deleteAccountUrl: null, ...patch
});

function render() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  const session = TestBed.inject(SessionStore);
  session.setUser(user(true));
  const fixture = TestBed.createComponent(ConsentGate);
  fixture.detectChanges();
  return { fixture, session, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
}

function tickAge(fixture: { detectChanges(): void }, el: HTMLElement): void {
  (el.querySelector('input[type=checkbox]') as HTMLInputElement).click();
  fixture.detectChanges();
}

describe('ConsentGate', () => {
  it('shows the agreement without links while no URLs are configured', async () => {
    const { fixture, http, el } = render();
    http.expectOne(`${API_URL}/config`).flush(config());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('By continuing you agree to the');
    expect(el.textContent).toContain('Privacy Policy');
    expect(el.querySelectorAll('a').length).toBe(0);
  });

  it('links the documents when the config has URLs', async () => {
    const { fixture, http, el } = render();
    http.expectOne(`${API_URL}/config`).flush(config({ termsUrl: 'https://legal.test/terms', privacyUrl: 'https://legal.test/privacy' }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect([...el.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['https://legal.test/terms', 'https://legal.test/privacy']);
  });

  it('keeps Accept disabled until the age checkbox is ticked', async () => {
    const { fixture, http, el } = render();
    http.expectOne(`${API_URL}/config`).flush(config());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain("I'm 18 or older");
    const accept = el.querySelector('button') as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    accept.click();
    http.expectNone(`${API_URL}/me/consent`);

    tickAge(fixture, el);
    expect(accept.disabled).toBe(false);
    tickAge(fixture, el);
    expect(accept.disabled).toBe(true);
  });

  it('accepts the current versions with the age confirmation and lifts the gate', async () => {
    const { fixture, http, el, session } = render();
    http.expectOne(`${API_URL}/config`).flush(config());
    await fixture.whenStable();

    tickAge(fixture, el);
    el.querySelector('button')!.click();
    const req = await vi.waitFor(() => http.expectOne(`${API_URL}/me/consent`));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ termsVersion: '2026-10', privacyVersion: '2026-11', ageConfirmed: true });
    req.flush(user(false));
    await fixture.whenStable();

    expect(session.user()?.consentRequired).toBe(false);
  });

  it('re-reads the config when the versions changed meanwhile', async () => {
    const { fixture, http, el, session } = render();
    http.expectOne(`${API_URL}/config`).flush(config());
    await fixture.whenStable();

    tickAge(fixture, el);
    el.querySelector('button')!.click();
    (await vi.waitFor(() => http.expectOne(`${API_URL}/me/consent`))).flush({ code: 'CONFLICT', message: 'Outdated' }, { status: 409, statusText: 'Conflict' });
    (await vi.waitFor(() => http.expectOne(`${API_URL}/config`))).flush(config({ termsVersion: '2026-12' }));
    await vi.waitFor(() => expect(TestBed.inject(ToastService).message()?.error).toBe(true));

    expect(session.user()?.consentRequired).toBe(true);
    el.querySelector('button')!.click();
    const retry = await vi.waitFor(() => http.expectOne(`${API_URL}/me/consent`));
    expect(retry.request.body).toEqual({ termsVersion: '2026-12', privacyVersion: '2026-11', ageConfirmed: true });
  });
});

describe('isUpdateRequired', () => {
  it('blocks only builds below the minimum', () => {
    expect(isUpdateRequired(5, '4')).toBe(true);
    expect(isUpdateRequired(5, 4)).toBe(true);
    expect(isUpdateRequired(5, '5')).toBe(false);
    expect(isUpdateRequired(5, '12')).toBe(false);
  });

  it('never blocks on a missing or unreadable build', () => {
    expect(isUpdateRequired(5, '')).toBe(false);
    expect(isUpdateRequired(5, 'abc')).toBe(false);
    expect(isUpdateRequired(5, null)).toBe(false);
    expect(isUpdateRequired(null, '3')).toBe(false);
    expect(isUpdateRequired(0, '3')).toBe(false);
  });
});
