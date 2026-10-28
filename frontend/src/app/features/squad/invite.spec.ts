import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { InviteResult, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { InvitePage } from './invite';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const sam = { id: 'f1', displayName: 'Sam', handle: 'sam', avatarUrl: null, path: 'LOSE' as const };

async function render(acceptInvite: () => Promise<InviteResult>, pro = true) {
  const api = { acceptInvite: vi.fn(acceptInvite) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ApiService, useValue: api },
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'me', pro, onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [] } as unknown as User);
  const fixture = TestBed.createComponent(InvitePage);
  fixture.componentRef.setInput('code', 'ABC123');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { api, el: fixture.nativeElement as HTMLElement };
}

describe('InvitePage', () => {
  beforeEach(() => localStorage.clear());

  it('says a request was sent and that the owner accepts it', async () => {
    const { api, el } = await render(() => Promise.resolve({ user: sam, relation: 'REQUESTED' }));
    expect(api.acceptInvite).toHaveBeenCalledWith('ABC123');
    expect(el.textContent).toContain('Request sent');
    expect(el.textContent).toContain("Request sent to Sam — they'll add you when they accept.");
    expect(el.textContent).not.toMatch(/now friends|added instantly/);
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/squad/friends');
  });

  it('says when we are already friends', async () => {
    const { el } = await render(() => Promise.resolve({ user: sam, relation: 'FRIEND' }));
    expect(el.textContent).toContain("You're friends");
    expect(el.textContent).toContain('You and Sam are friends.');
  });

  it('does not claim the link expired when it fails', async () => {
    const { el } = await render(() => Promise.reject(new HttpErrorResponse({ status: 404, error: { code: 'NOT_FOUND', message: 'Invite not found' } })));
    expect(el.textContent).toContain('Invite not valid');
    expect(el.textContent).not.toContain('expired');
  });

  it('sends free users to the paywall without calling the server', async () => {
    const navigate = vi.spyOn(Router.prototype, 'navigateByUrl');
    const { api } = await render(() => Promise.resolve({ user: sam, relation: 'REQUESTED' }), false);
    expect(api.acceptInvite).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/paywall', { replaceUrl: true });
    navigate.mockRestore();
  });
});
