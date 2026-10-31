import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../core/api/api.service';
import { FeedItem, Relation, User, UserProfile } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { UserPage } from './user';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const mia = { id: 'u2', displayName: 'Mia', handle: 'mia', avatarUrl: null, path: 'LOSE' as const, bio: 'Down 6 kg so far' };

const post = (id: string): FeedItem => ({
  id, type: 'QUEST_PROOF', user: mia, createdAt: new Date().toISOString(), photoUrl: null, title: `Post ${id}`, subtitle: null, deltaValue: null,
  value: null, unit: null, proofId: null, verification: null, hypeCount: 0, hypedByMe: false, commentCount: 0, transformation: null,
  hidden: false, aiChecked: false, isPublic: true
});

const profile = (relation: Relation, requestId: string | null = null): UserProfile => ({ user: mia, relation, requestId });

async function render(p: UserProfile, posts: FeedItem[] = [post('a')]) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'me', pro: true, onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [] } as unknown as User);
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(UserPage);
  fixture.componentRef.setInput('id', 'u2');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  http.expectOne(`${API_URL}/users/u2/profile`).flush(p);
  await settle();
  http.expectOne(r => r.url === `${API_URL}/users/u2/feed`).flush(posts);
  await settle();
  await settle();
  const buttonWith = (text: string) => Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes(text)) as HTMLButtonElement;
  return { el, http, settle, buttonWith };
}

describe('UserPage', () => {
  it('shows the person, their bio and the posts I can see', async () => {
    const { el } = await render(profile('FRIEND'));

    expect(el.textContent).toContain('Mia');
    expect(el.textContent).toContain('@mia');
    expect(el.textContent).toContain('Down 6 kg so far');
    expect(el.textContent).toContain('Post a');
    expect(el.textContent).toContain('Friends');
  });

  it('sends a friend request and then shows it as requested', async () => {
    const { http, settle, buttonWith, el } = await render(profile('NONE'), []);
    expect(el.textContent).toContain('Add them as a friend to see more');

    buttonWith('Add friend').click();
    const req = http.expectOne(`${API_URL}/social/requests`);
    expect(req.request.body).toEqual({ userId: 'u2' });
    req.flush({ id: 'r1', from: { ...mia, id: 'me' }, to: mia, createdAt: new Date().toISOString() });
    await settle();

    expect(buttonWith('Requested')).toBeTruthy();
  });

  it('accepts an incoming request with its id', async () => {
    const { http, settle, buttonWith } = await render(profile('INCOMING', 'r7'));

    buttonWith('Accept').click();
    http.expectOne(`${API_URL}/social/requests/r7/accept`).flush(mia);
    await settle();

    expect(buttonWith('Friends')).toBeTruthy();
  });

  it('says the profile is gone on a 404', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
      ]
    });
    TestBed.inject(SessionStore).setUser({ id: 'me', pro: true, onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [] } as unknown as User);
    const fixture = TestBed.createComponent(UserPage);
    fixture.componentRef.setInput('id', 'u2');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${API_URL}/users/u2/profile`).flush({ message: 'User not found' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Profile not found');
  });
});
