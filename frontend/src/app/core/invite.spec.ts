import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, convertToParamMap, provideRouter } from '@angular/router';
import { API_URL } from './api/api.service';
import { PendingInvite, inviteMessage, rememberInviteGuard } from './invite';
import { LockService } from './native/lock';
import { SessionStore } from './session.store';
import { ToastService } from './toast.service';

const sam = { id: 'f1', displayName: 'Sam', handle: 'sam', avatarUrl: null, path: 'LOSE' as const };

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  return { invite: TestBed.inject(PendingInvite), http: TestBed.inject(HttpTestingController) };
}

const open = (code: string) =>
  TestBed.runInInjectionContext(() => rememberInviteGuard({ paramMap: convertToParamMap({ code }) } as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

describe('PendingInvite', () => {
  beforeEach(() => localStorage.clear());

  it('remembers the code when an invite link is opened', async () => {
    const { invite } = setup();
    expect(await open('ABC123')).toBe(true);
    expect(await invite.get()).toBe('ABC123');
  });

  it('ignores codes with unexpected characters', async () => {
    const { invite } = setup();
    await open('../x');
    expect(await invite.get()).toBeNull();
  });

  it('sends the friend request of a pending invite once and forgets it', async () => {
    const { invite, http } = setup();
    await invite.remember('ABC123');
    const done = invite.acceptPending();
    (await vi.waitFor(() => http.expectOne(`${API_URL}/social/invite/ABC123/accept`))).flush({ user: sam, relation: 'REQUESTED' });
    await done;
    expect(await invite.get()).toBeNull();
    expect(TestBed.inject(ToastService).message()?.text).toBe("Request sent to Sam — they'll add you when they accept.");
  });

  it('never promises an instant friendship', () => {
    expect(inviteMessage({ user: sam, relation: 'REQUESTED' })).toBe("Request sent to Sam — they'll add you when they accept.");
    expect(inviteMessage({ user: sam, relation: 'FRIEND' })).toBe("You're friends with Sam.");
  });

  it('keeps the code when the server cannot be reached', async () => {
    const { invite, http } = setup();
    await invite.remember('ABC123');
    const done = invite.acceptPending();
    (await vi.waitFor(() => http.expectOne(`${API_URL}/social/invite/ABC123/accept`))).error(new ProgressEvent('error'));
    await done;
    expect(await invite.get()).toBe('ABC123');
  });

  it('is forgotten on sign-out', async () => {
    const { invite } = setup();
    await invite.remember('ABC123');
    await TestBed.inject(SessionStore).clear();
    expect(await invite.get()).toBeNull();
  });
});
