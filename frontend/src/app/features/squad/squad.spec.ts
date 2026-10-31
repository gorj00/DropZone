import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { FeedItem, FeedScope, Page, Period, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { SquadPage } from './squad';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const mia = { id: 'u2', displayName: 'Mia', handle: 'mia', avatarUrl: null, path: 'LOSE' as const };

const item = (id: string): FeedItem => ({
  id, type: 'QUEST_PROOF', user: mia, createdAt: new Date().toISOString(), photoUrl: null, title: `Post ${id}`, subtitle: null, deltaValue: null,
  value: null, unit: null, proofId: null, verification: null, hypeCount: 0, hypedByMe: false, commentCount: 0, transformation: null,
  hidden: false, aiChecked: false, isPublic: true
});

type FeedFn = (scope: FeedScope, cursor?: string, limit?: number) => Promise<Page<FeedItem>>;

async function render(feed: FeedFn, query: BehaviorSubject<ParamMap> | null = null) {
  const api = {
    feed: vi.fn(feed),
    pendingCount: vi.fn().mockResolvedValue({ count: 2 }),
    friendRequests: vi.fn().mockResolvedValue({ incoming: [], outgoing: [] }),
    leaderboard: vi.fn((p: Period) => Promise.resolve({ period: p, path: 'LOSE', metric: 'WEIGHT', unit: 'kg', endsAt: new Date().toISOString(), entries: [], me: null }))
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      ...(query ? [{ provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: query.value }, queryParamMap: query.asObservable() } }] : []),
      { provide: ApiService, useValue: api },
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'me', path: 'LOSE', pro: true, onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [] } as unknown as User);
  const fixture = TestBed.createComponent(SquadPage);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const page = fixture.componentInstance as unknown as { more(): void };
  const buttonWith = (text: string) => Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
  return { fixture, el, api, settle, page, buttonWith };
}

describe('SquadPage', () => {
  it('pages with the X-Next-Cursor value and stops only when there is none', async () => {
    const pages: Record<string, Page<FeedItem>> = {
      first: { items: [item('a'), item('b')], next: 'c1' },
      c1: { items: [item('c')], next: 'c2' },
      c2: { items: [item('d')], next: null }
    };
    const { api, page, settle, el } = await render((_s, cursor) => Promise.resolve(pages[cursor ?? 'first']));

    page.more();
    await settle();
    page.more();
    await settle();
    page.more();
    await settle();

    expect(api.feed.mock.calls.map(c => c[1])).toEqual([undefined, 'c1', 'c2']);
    expect(el.textContent).toContain('Post d');
    expect(el.textContent).not.toContain('Load more');
  });

  it('keeps paging after a short page while a cursor comes back', async () => {
    const { api, page, settle } = await render((_s, cursor) => Promise.resolve(cursor ? { items: [], next: null } : { items: [item('a')], next: 'c1' }));
    page.more();
    await settle();
    expect(api.feed).toHaveBeenLastCalledWith('FRIENDS', 'c1', 20);
  });

  it('opens the to-verify list from the chip', async () => {
    const { api, settle, el, buttonWith } = await render(scope => Promise.resolve({ items: scope === 'TO_VERIFY' ? [item('v1')] : [], next: null }));
    expect(buttonWith('2 to verify')).toBeDefined();

    buttonWith('2 to verify')!.click();
    await settle();

    expect(api.feed).toHaveBeenLastCalledWith('TO_VERIFY', undefined, 20);
    expect(el.textContent).toContain('Proofs you can verify');
    expect(el.textContent).toContain('Post v1');
  });

  it('opens straight on the to-verify list from a batched verify push link', async () => {
    const query = new BehaviorSubject(convertToParamMap({ show: 'verify' }));
    const { api, el } = await render(scope => Promise.resolve({ items: scope === 'TO_VERIFY' ? [item('v1')] : [], next: null }), query);

    expect(api.feed).toHaveBeenCalledTimes(1);
    expect(api.feed).toHaveBeenCalledWith('TO_VERIFY', undefined, 20);
    expect(el.textContent).toContain('Proofs you can verify');
  });

  it('switches to the to-verify list when the link arrives on an open Community tab', async () => {
    const query = new BehaviorSubject(convertToParamMap({}));
    const { api, el, settle } = await render(scope => Promise.resolve({ items: scope === 'TO_VERIFY' ? [item('v1')] : [], next: null }), query);
    expect(api.feed).toHaveBeenLastCalledWith('FRIENDS', undefined, 20);

    query.next(convertToParamMap({ show: 'verify' }));
    await settle();

    expect(api.feed).toHaveBeenLastCalledWith('TO_VERIFY', undefined, 20);
    expect(el.textContent).toContain('Post v1');
  });

  it('shows a retry instead of the quiet state when the feed fails', async () => {
    let fail = true;
    const { settle, el, buttonWith } = await render(() => (fail ? Promise.reject(new Error('offline')) : Promise.resolve({ items: [item('a')], next: null })));

    expect(el.textContent).toContain("Couldn't load posts");
    expect(el.textContent).not.toContain('Your community is quiet');
    fail = false;
    buttonWith('Retry')!.click();
    await settle();

    expect(el.textContent).toContain('Post a');
  });
  it('reloads the feed in place when pulled down from the top', async () => {
    let round = 0;
    const { api, settle, el } = await render(() => Promise.resolve({ items: [item(round++ ? 'fresh' : 'old')], next: null }));
    const touch = (type: string, y?: number) => {
      const e = new Event(type, { bubbles: true });
      Object.defineProperty(e, 'touches', { value: y === undefined ? [] : [{ clientY: y }] });
      el.querySelector('.screen')!.dispatchEvent(e);
    };
    touch('touchstart', 100);
    touch('touchmove', 140);
    touch('touchend');
    await settle();
    expect(api.feed).toHaveBeenCalledTimes(1);

    touch('touchstart', 100);
    touch('touchmove', 260);
    touch('touchend');
    await settle();

    expect(api.feed).toHaveBeenCalledTimes(2);
    expect(api.feed.mock.calls[1][1]).toBeUndefined();
    expect(el.textContent).toContain('Post fresh');
    expect(el.textContent).not.toContain('Post old');
  });
});
