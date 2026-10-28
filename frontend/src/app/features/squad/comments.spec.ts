import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../core/api/api.service';
import { FeedComment, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { CommentsThread } from './comments';

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

describe('CommentsThread', () => {
  it('keeps the text in the box when sending fails and clears it after a successful send', async () => {
    const { el, http, toast, settle } = render();
    http.expectOne(`${API_URL}/feed/f1/comments`).flush([]);
    await settle();

    const input = el.querySelector('input') as HTMLInputElement;
    const form = el.querySelector('form') as HTMLFormElement;
    input.value = 'Great job';
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
