import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { FriendRequest, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { FriendsPage, searchTerm } from './friends';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const me = { id: 'me', displayName: 'Alex', handle: 'alex', avatarUrl: null, path: 'LOSE' as const };
const mia = { id: 'u2', displayName: 'Mia', handle: 'mia', avatarUrl: null, path: 'LOSE' as const };
const request: FriendRequest = { id: 'r1', from: mia, to: me, createdAt: new Date().toISOString() };

async function render(pro: boolean) {
  const api = {
    friends: vi.fn().mockResolvedValue([]),
    friendRequests: vi.fn().mockResolvedValue({ incoming: [request], outgoing: [] }),
    invite: vi.fn().mockResolvedValue({ code: 'ABC', url: 'https://dropzone.mobi/invite/ABC' }),
    searchUsers: vi.fn().mockResolvedValue([mia]),
    acceptFriendRequest: vi.fn().mockResolvedValue(mia),
    deleteFriendRequest: vi.fn().mockResolvedValue(undefined)
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ApiService, useValue: api },
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'me', pro, onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [] } as unknown as User);
  const fixture = TestBed.createComponent(FriendsPage);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const button = (text: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
  const type = async (q: string) => {
    const input = el.querySelector('input[type=search]') as HTMLInputElement;
    input.value = q;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  return { api, el, settle, button, type };
}

describe('FriendsPage', () => {
  afterEach(() => vi.useRealTimers());

  it('explains that the invite link sends a request', async () => {
    const { el } = await render(true);
    expect(el.textContent).toContain('Friends who open your link send you a friend request.');
    expect(el.textContent).not.toContain('instantly');
  });

  it('asks for 3 letters before it searches', async () => {
    vi.useFakeTimers();
    const { api, el, type, settle } = await render(true);
    expect((el.querySelector('input[type=search]') as HTMLInputElement).placeholder).toBe('Search by @handle or full name');

    await type('@mi');
    expect(el.textContent).toContain('Type at least 3 letters.');
    vi.advanceTimersByTime(400);
    expect(api.searchUsers).not.toHaveBeenCalled();

    await type('@mia');
    expect(el.textContent).not.toContain('Type at least 3 letters.');
    vi.advanceTimersByTime(400);
    vi.useRealTimers();
    await vi.waitFor(() => expect(api.searchUsers).toHaveBeenCalledWith('mia'));
    await settle();
    expect(el.textContent).toContain('@mia');
  });

  it('strips the @ and spaces from the search term', () => {
    expect(searchTerm('  @mia ')).toBe('mia');
    expect(searchTerm('Mia Rose')).toBe('Mia Rose');
  });

  it('shows free users their requests read-only with Go PRO to accept', async () => {
    const { api, el, button } = await render(false);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    expect(api.friendRequests).toHaveBeenCalled();
    expect(api.friends).not.toHaveBeenCalled();
    expect(api.invite).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Requests · 1');
    expect(el.textContent).toContain('Mia');
    expect(button('Accept')).toBeUndefined();
    expect(el.querySelector('input[type=search]')).toBeNull();
    expect(el.textContent).toContain('Go PRO to accept them.');

    button('Go PRO to accept')!.click();
    expect(navigate).toHaveBeenCalledWith('/paywall');
    expect(api.acceptFriendRequest).not.toHaveBeenCalled();
  });

  it('lets free users decline a request', async () => {
    const { api, el, settle } = await render(false);
    const prompt = TestBed.inject(PromptService);
    (el.querySelector('button[aria-label=Decline]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(prompt.confirmation()?.title).toBe('Decline friend request?'));
    prompt.answer(true);
    await vi.waitFor(() => expect(api.deleteFriendRequest).toHaveBeenCalledWith('r1'));
    await settle();
    expect(el.textContent).not.toContain('Requests · 1');
  });

  it('keeps Accept for PRO users', async () => {
    const { api, button, settle, el } = await render(true);
    await vi.waitFor(async () => {
      await settle();
      expect(button('Accept')).toBeDefined();
    });
    button('Accept')!.click();
    await vi.waitFor(() => expect(api.acceptFriendRequest).toHaveBeenCalledWith('r1'));
    await settle();
    expect(el.textContent).toContain('Your friends · 1');
  });
});
