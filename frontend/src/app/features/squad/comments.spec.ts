import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../core/api/api.service';
import { FeedComment, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { COMMENT_LIMIT, CommentsThread } from './comments';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const mia = { id: 'u2', displayName: 'Mia', handle: 'mia', avatarUrl: null, path: 'LOSE' as const };

function comment(patch: Partial<FeedComment> = {}): FeedComment {
  return { id: 'c1', feedItemId: 'f1', user: mia, body: 'Nice drop', createdAt: new Date().toISOString(), mine: false, likeCount: 0, likedByMe: false, canDelete: false, ...patch };
}

function render() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'me', pro: true, onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [] } as unknown as User);
  const fixture = TestBed.createComponent(CommentsThread);
  fixture.componentRef.setInput('feedItemId', 'f1');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, el, settle, http: TestBed.inject(HttpTestingController), toast: TestBed.inject(ToastService) };
}

function type(field: HTMLTextAreaElement, text: string): void {
  field.value = text;
  field.dispatchEvent(new Event('input'));
}

function longPress(target: Element): void {
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}

describe('CommentsThread', () => {
  it('keeps the text in the box when sending fails and clears it after a successful send', async () => {
    const { el, http, toast, settle } = render();
    http.expectOne(`${API_URL}/feed/f1/comments`).flush([]);
    await settle();

    const input = el.querySelector('textarea') as HTMLTextAreaElement;
    const form = el.querySelector('form') as HTMLFormElement;
    type(input, 'Great job');
    form.dispatchEvent(new Event('submit'));
    const failed = http.expectOne(`${API_URL}/feed/f1/comments`);
    expect(failed.request.body).toEqual({ body: 'Great job' });
    failed.error(new ProgressEvent('error'));
    await settle();

    expect(input.value).toBe('Great job');
    expect(toast.message()?.error).toBe(true);

    form.dispatchEvent(new Event('submit'));
    http.expectOne(`${API_URL}/feed/f1/comments`).flush(comment({ id: 'c2', body: 'Great job', mine: true, canDelete: true, user: { ...mia, id: 'me' } }));
    await settle();

    expect(input.value).toBe('');
    expect(el.textContent).toContain('Great job');
  });

  it('shows the delete action from canDelete and the menu for other people\'s comments', async () => {
    const { el, http, settle } = render();
    http.expectOne(`${API_URL}/feed/f1/comments`).flush([comment({ canDelete: true }), comment({ id: 'c2', canDelete: false })]);
    await settle();

    expect(el.querySelectorAll('button[aria-label="Delete comment"]').length).toBe(1);
    expect(el.querySelectorAll('button[aria-label="More"]').length).toBe(2);
  });

  it('nests replies under their comment behind a "View replies" toggle', async () => {
    const { el, http, settle } = render();
    http.expectOne(`${API_URL}/feed/f1/comments`).flush([
      comment(),
      comment({ id: 'c2', body: '@mia same here', parentId: 'c1' }),
      comment({ id: 'c3', body: 'Orphan', parentId: 'gone' })
    ]);
    await settle();

    expect(el.textContent).not.toContain('same here');
    expect(el.textContent).not.toContain('Orphan');
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('View 1 reply')) as HTMLButtonElement).click();
    await settle();

    expect(el.textContent).toContain('same here');
    expect(el.querySelector('[data-comment="c2"] .text-accent2')?.textContent).toBe('@mia');
  });

  it('replies to a comment with the @handle and shows the reply under it', async () => {
    const { el, http, settle } = render();
    http.expectOne(`${API_URL}/feed/f1/comments`).flush([comment()]);
    await settle();

    (Array.from(el.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Reply') as HTMLButtonElement).click();
    await settle();
    const input = el.querySelector('textarea') as HTMLTextAreaElement;
    expect(input.value).toBe('@mia ');
    expect(el.textContent).toContain('Replying to Mia');

    type(input, '@mia you too');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = http.expectOne(`${API_URL}/feed/f1/comments`);
    expect(req.request.body).toEqual({ body: '@mia you too', replyToId: 'c1' });
    req.flush(comment({ id: 'c9', body: '@mia you too', parentId: 'c1', mine: true, canDelete: true, user: { ...mia, id: 'me' } }));
    await settle();

    expect(el.textContent).toContain('you too');
    expect(el.textContent).not.toContain('Replying to');
    expect(input.value).toBe('');
  });

  it('turns the counter red and blocks sending over the limit', async () => {
    const { el, http, settle } = render();
    http.expectOne(`${API_URL}/feed/f1/comments`).flush([]);
    await settle();
    const input = el.querySelector('textarea') as HTMLTextAreaElement;
    const send = el.querySelector('button[aria-label="Send"]') as HTMLButtonElement;

    type(input, 'a'.repeat(COMMENT_LIMIT - 20));
    await settle();
    expect(el.querySelector('[data-test="counter"]')?.textContent).toContain(`${COMMENT_LIMIT - 20}/${COMMENT_LIMIT}`);
    expect(send.disabled).toBe(false);

    type(input, 'a'.repeat(COMMENT_LIMIT + 1));
    await settle();
    expect(el.querySelector('[data-test="counter"]')?.textContent).toContain('Too long');
    expect(input.style.borderColor).not.toBe('');
    expect(send.disabled).toBe(true);
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http.expectNone(`${API_URL}/feed/f1/comments`);
  });

  it('opens reply, copy and report actions on a long press', async () => {
    const { el, http, settle, toast } = render();
    http.expectOne(`${API_URL}/feed/f1/comments`).flush([comment()]);
    await settle();
    const choose = vi.spyOn(TestBed.inject(PromptService), 'choose').mockResolvedValue('copy');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    longPress(el.querySelector('[data-comment="c1"]')!);
    await settle();

    expect(choose.mock.calls[0][1].map(o => o.key)).toEqual(['reply', 'copy', 'report', 'user', 'block']);
    expect(writeText).toHaveBeenCalledWith('Nice drop');
    expect(toast.message()?.text).toBe('Copied.');
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('offers reply, copy and delete on my own comment', async () => {
    const { el, http, settle } = render();
    http.expectOne(`${API_URL}/feed/f1/comments`).flush([comment({ mine: true, canDelete: true, user: { ...mia, id: 'me' } })]);
    await settle();
    const choose = vi.spyOn(TestBed.inject(PromptService), 'choose').mockResolvedValue(null);

    longPress(el.querySelector('[data-comment="c1"]')!);
    await settle();

    expect(choose.mock.calls[0][1].map(o => o.key)).toEqual(['reply', 'copy', 'delete']);
  });

  it('removes the replies together with a deleted comment', async () => {
    const { el, http, settle } = render();
    http.expectOne(`${API_URL}/feed/f1/comments`).flush([comment({ canDelete: true }), comment({ id: 'c2', body: 'Reply text', parentId: 'c1' })]);
    await settle();
    vi.spyOn(TestBed.inject(PromptService), 'confirm').mockResolvedValue(true);

    (el.querySelector('[data-comment="c1"] button[aria-label="Delete comment"]') as HTMLButtonElement).click();
    await settle();
    http.expectOne(`${API_URL}/comments/c1`).flush(null);
    await settle();

    expect(el.textContent).not.toContain('Nice drop');
    expect(el.textContent).not.toContain('View 1 reply');
  });

  it('links the avatar and name to the person', async () => {
    const { el, http, settle } = render();
    http.expectOne(`${API_URL}/feed/f1/comments`).flush([comment(), comment({ id: 'c2', mine: true, user: { ...mia, id: 'me' } })]);
    await settle();

    expect(el.querySelector('[data-comment="c1"] a')?.getAttribute('href')).toBe('/u/u2');
    expect(el.querySelector('[data-comment="c2"] a')?.getAttribute('href')).toBe('/me');
  });

  it('shows a retry instead of "No comments yet" when loading fails', async () => {
    const { el, http, settle } = render();
    http.expectOne(`${API_URL}/feed/f1/comments`).error(new ProgressEvent('error'));
    await settle();

    expect(el.textContent).toContain("Couldn't load comments");
    expect(el.textContent).not.toContain('No comments yet');
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Retry')) as HTMLButtonElement).click();
    http.expectOne(`${API_URL}/feed/f1/comments`).flush([comment()]);
    await settle();

    expect(el.textContent).toContain('Nice drop');
  });
});
