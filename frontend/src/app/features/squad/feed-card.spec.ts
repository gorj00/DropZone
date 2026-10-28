import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../core/api/api.service';
import { FeedItem, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { FeedCard } from './feed-card';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const author = { id: 'u2', displayName: 'Mia Tran', handle: 'mia', avatarUrl: null, path: 'LOSE' as const };
const me = { ...author, id: 'me', displayName: 'Alex', handle: 'alex' };

function post(patch: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'f1', type: 'QUEST_PROOF', user: author, createdAt: new Date().toISOString(), photoUrl: null, title: 'Healthy meal', subtitle: null,
    deltaValue: null, value: null, unit: null, proofId: null, verification: null, hypeCount: 2, hypedByMe: false, commentCount: 0,
    transformation: null, hidden: false, aiChecked: false, isPublic: true, ...patch
  };
}

function render(item: FeedItem) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined), sync: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'me', pro: true, onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [] } as unknown as User);
  const fixture = TestBed.createComponent(FeedCard);
  const events = { changed: [] as FeedItem[], removed: [] as string[] };
  fixture.componentRef.setInput('item', item);
  fixture.componentInstance.changed.subscribe(x => {
    events.changed.push(x);
    fixture.componentRef.setInput('item', x);
  });
  fixture.componentInstance.removed.subscribe(id => events.removed.push(id));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture, el, events,
    http: TestBed.inject(HttpTestingController),
    prompt: TestBed.inject(PromptService),
    toast: TestBed.inject(ToastService),
    button: (label: string) => el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement
  };
}

describe('FeedCard', () => {
  it('ignores a second hype tap while the first one is running', async () => {
    const { fixture, http, toast, events, button } = render(post());
    button('Hype').click();
    button('Hype').click();

    const req = http.expectOne(`${API_URL}/feed/f1/hype`);
    expect(events.changed.at(-1)).toMatchObject({ hypedByMe: true, hypeCount: 3 });
    req.flush(post({ hypedByMe: true, hypeCount: 3 }));
    await fixture.whenStable();

    expect(events.changed.at(-1)).toMatchObject({ hypedByMe: true, hypeCount: 3 });
    expect(toast.message()).toBeNull();
    http.verify();

    button('Hype').click();
    http.expectOne(`${API_URL}/feed/f1/hype`).flush(post({ hypedByMe: false, hypeCount: 2 }));
    await fixture.whenStable();
    expect(events.changed.at(-1)).toMatchObject({ hypedByMe: false, hypeCount: 2 });
  });

  it('says AI verified only when the AI check passed, otherwise the server summary', () => {
    const plain = render(post({ aiChecked: false, subtitle: 'Photo proof' })).el;
    expect(plain.textContent).not.toContain('AI VERIFIED');
    expect(plain.textContent).toContain('Photo proof');
    TestBed.resetTestingModule();
    expect(render(post({ aiChecked: true, subtitle: 'AI verified' })).el.querySelector('[data-test=ai-chip]')?.textContent?.trim()).toBe('AI VERIFIED');
  });

  it('flags my own reported post with a short reason', () => {
    const review = render(post({ user: me, hidden: true, moderation: 'UNDER_REVIEW' })).el;
    const flag = review.querySelector('[data-test=reported]')!;
    expect(flag.querySelector('.tag')?.textContent?.trim()).toBe('Reported');
    expect(flag.textContent).toContain('Hidden while we review reports about it.');
    expect(review.textContent).not.toContain('HIDDEN · IN REVIEW');
    TestBed.resetTestingModule();
    const removed = render(post({ user: me, type: 'CHECKPOINT_CLEARED', moderation: 'REMOVED' })).el;
    expect(removed.querySelector('[data-test=reported]')?.textContent).toContain('Removed for breaking the community rules.');
    TestBed.resetTestingModule();
    expect(render(post({ moderation: null })).el.querySelector('[data-test=reported]')).toBeNull();
  });

  it('lets the author make a public post private', async () => {
    const { fixture, http, prompt, toast, events, button } = render(post({ user: me }));
    button('More').click();
    expect(prompt.choice()?.options.map(o => o.label)).toEqual(['Friends only', 'Delete post']);
    prompt.pick('private');

    const req = await vi.waitFor(() => http.expectOne(`${API_URL}/feed/f1`));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ isPublic: false });
    req.flush(post({ user: me, isPublic: false }));
    await fixture.whenStable();

    expect(events.changed.at(-1)?.isPublic).toBe(false);
    expect(toast.message()?.text).toBe('Only your friends can see this post now.');
  });

  it('offers only delete on a private post of the author', () => {
    const { prompt, button } = render(post({ user: me, isPublic: false }));
    button('More').click();
    expect(prompt.choice()?.options.map(o => o.key)).toEqual(['delete']);
  });

  it('deletes the author\'s post after the confirm and reloads Today and the goal for a proof', async () => {
    const { fixture, http, prompt, events, button } = render(post({ user: me, proofId: 'p1' }));
    button('More').click();
    prompt.pick('delete');
    await vi.waitFor(() => expect(prompt.confirmation()?.title).toBe('Delete this post?'));
    prompt.answer(true);

    const req = await vi.waitFor(() => http.expectOne(`${API_URL}/feed/f1`));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(events.removed).toEqual(['f1']);
    http.expectOne(r => r.url === `${API_URL}/today`);
    http.expectOne(`${API_URL}/goal`);
  });

  it('does nothing when the delete is cancelled', async () => {
    const { http, prompt, events, button } = render(post({ user: me }));
    button('More').click();
    prompt.pick('delete');
    await vi.waitFor(() => expect(prompt.confirmation()).not.toBeNull());
    prompt.answer(false);
    await Promise.resolve();

    http.expectNone(`${API_URL}/feed/f1`);
    expect(events.removed).toEqual([]);
  });

  it('reports the author of someone else\'s post', async () => {
    const { http, prompt, button } = render(post());
    button('More').click();
    expect(prompt.choice()?.options.map(o => o.label)).toEqual(['Report post', 'Report Mia Tran', 'Block Mia Tran']);
    prompt.pick('user');
    await vi.waitFor(() => expect(prompt.choice()?.title).toBe('Why are you reporting this person?'));
    prompt.pick('Harassment');

    const req = await vi.waitFor(() => http.expectOne(`${API_URL}/reports`));
    expect(req.request.body).toEqual({ targetType: 'USER', targetId: 'u2', reason: 'Harassment' });
  });
});
