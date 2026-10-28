import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../../core/api/api.service';
import { User } from '../../core/api/models';
import { authInterceptor } from '../../core/auth';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { EXPORT_BRIDGE } from '../../core/data-export';
import { SuspendedGate } from './gates';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const user = (suspended = false) => ({ id: 'u1', onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [], suspended }) as unknown as User;

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: 'welcome', children: [] }, { path: '**', children: [] }]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } },
      { provide: EXPORT_BRIDGE, useValue: { native: false, fs: { writeFile: vi.fn() }, share: { share: vi.fn() } } }
    ]
  });
  return { session: TestBed.inject(SessionStore), http: TestBed.inject(HttpClient), backend: TestBed.inject(HttpTestingController) };
}

describe('suspended account', () => {
  beforeEach(() => localStorage.clear());

  it('turns suspended on a 403 SUSPENDED from any call', async () => {
    const { session, http, backend } = setup();
    await session.signIn('tok', user());
    expect(session.suspended()).toBe(false);

    const call = firstValueFrom(http.get(`${API_URL}/today`)).catch(e => e);
    backend.expectOne(`${API_URL}/today`).flush({ code: 'SUSPENDED', message: 'Suspended' }, { status: 403, statusText: 'Forbidden' });
    await call;

    expect(session.suspended()).toBe(true);
    expect(session.loggedIn()).toBe(true);
    await session.clear();
    expect(session.suspended()).toBe(false);
  });

  it('ignores other 403 errors', async () => {
    const { session, http, backend } = setup();
    await session.signIn('tok', user());
    const call = firstValueFrom(http.get(`${API_URL}/feed/f1`)).catch(e => e);
    backend.expectOne(`${API_URL}/feed/f1`).flush({ code: 'FORBIDDEN', message: 'No' }, { status: 403, statusText: 'Forbidden' });
    await call;
    expect(session.suspended()).toBe(false);
    await session.clear();
  });

  it('follows suspended from /me in both directions', async () => {
    const { session } = setup();
    await session.signIn('tok', user(true));
    expect(session.suspended()).toBe(true);
    session.setUser(user(false));
    expect(session.suspended()).toBe(false);
    await session.clear();
  });
});

describe('SuspendedGate', () => {
  beforeEach(() => localStorage.clear());

  async function render() {
    const ctx = setup();
    await ctx.session.signIn('tok', user(true));
    const fixture = TestBed.createComponent(SuspendedGate);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (text: string) => Array.from(el.querySelectorAll('button')).find(b => b.textContent?.trim() === text) as HTMLButtonElement;
    return { ...ctx, fixture, el, button };
  }

  it('offers sign out, data download and delete account', async () => {
    const { el, session, button, fixture } = await render();
    expect(el.textContent).toContain('Your account is suspended');
    expect(el.textContent).not.toContain('A moderator suspended');
    expect(Array.from(el.querySelectorAll('button')).map(b => b.textContent?.trim())).toEqual(['Sign out', 'Download my data', 'Delete account']);

    button('Sign out').click();
    await vi.waitFor(() => expect(session.loggedIn()).toBe(false));
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/welcome');
  });

  it('downloads my data while suspended', async () => {
    const { backend, button, fixture } = await render();
    const created = vi.fn(() => 'blob:dropzone');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    button('Download my data').click();
    fixture.detectChanges();
    expect(button('Preparing your data…').disabled).toBe(true);
    const req = await vi.waitFor(() => backend.expectOne(`${API_URL}/me/export`));
    req.flush('{"profile":{}}');

    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    expect(created).toHaveBeenCalled();
    expect(TestBed.inject(ToastService).message()?.text).toBe('Your data was downloaded.');
    click.mockRestore();
  });

  it('deletes the account after typing DELETE', async () => {
    const { el, session, backend, button, fixture } = await render();
    button('Delete account').click();
    fixture.detectChanges();

    const input = el.querySelector('#delete-confirm') as HTMLInputElement;
    input.value = 'DELETE';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Delete').click();

    const req = backend.expectOne(`${API_URL}/me`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() => expect(session.loggedIn()).toBe(false));
  });
});
