import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../core/api/api.service';
import { AppNotification } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { PromptService } from '../../core/prompt.service';
import { NotificationsPage, notificationLink } from './notifications';

const note = (id: string, patch: Partial<AppNotification> = {}): AppNotification => ({
  id, type: 'HYPE', actor: { id: 'u2', displayName: 'Mia', handle: 'mia', avatarUrl: null, path: 'LOSE' }, feedItemId: 'f1', proofId: null, commentId: null,
  text: null, read: false, createdAt: new Date().toISOString(), ...patch
});

describe('notificationLink', () => {
  it('opens the proof of a rejected proof', () => {
    expect(notificationLink(note('n', { type: 'PROOF_REJECTED', actor: null, feedItemId: null, proofId: 'p1' }))).toBe('/p/p1');
  });

  it('opens the admin view of the reported post, comment or the report list', () => {
    expect(notificationLink(note('n', { type: 'ADMIN_REPORT', actor: null, feedItemId: 'f1' }))).toBe('/admin/reports/POST/f1');
    expect(notificationLink(note('n', { type: 'ADMIN_REPORT', actor: null, feedItemId: 'f1', commentId: 'c1' }))).toBe('/admin/reports/COMMENT/c1');
    expect(notificationLink(note('n', { type: 'ADMIN_REPORT', actor: null, feedItemId: null }))).toBe('/admin/reports');
  });

  it('keeps the existing links', () => {
    expect(notificationLink(note('n'))).toBe('/post/f1');
    expect(notificationLink(note('n', { type: 'VERIFY', proofId: 'p2' }))).toBe('/p/p2');
    expect(notificationLink(note('n', { type: 'FRIEND_REQUEST' }))).toBe('/squad/friends');
  });
});

describe('NotificationsPage', () => {
  function render() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
      ]
    });
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, settle, http: TestBed.inject(HttpTestingController), page: fixture.componentInstance as unknown as { more(): void }, el: fixture.nativeElement as HTMLElement };
  }

  it('follows X-Next-Cursor until the header is gone, even after short pages', async () => {
    const { http, settle, page, el } = render();
    const first = http.expectOne(r => r.url === `${API_URL}/notifications`);
    expect(first.request.params.get('cursor')).toBeNull();
    first.flush([note('a')], { headers: { 'X-Next-Cursor': '2026-10-27T10:00:00Z_a' } });
    await settle();
    (await vi.waitFor(() => http.expectOne(`${API_URL}/notifications/read`))).flush(null);

    page.more();
    const second = http.expectOne(r => r.url === `${API_URL}/notifications`);
    expect(second.request.params.get('cursor')).toBe('2026-10-27T10:00:00Z_a');
    second.flush([note('b', { type: 'PROOF_REJECTED', actor: null, feedItemId: null, proofId: 'p1', text: 'A moderator removed your proof. Upload a new one to finish it.' })]);
    await vi.waitFor(async () => {
      await settle();
      expect(el.textContent).toContain('A moderator removed your proof.');
    });
    expect(el.textContent).not.toContain('“A moderator');
    expect(el.textContent).not.toContain('Loading…');

    page.more();
    http.expectNone(r => r.url === `${API_URL}/notifications`);
  });
});

describe('account notifications', () => {
  const play = 'https://play.google.com/store/account/subscriptions?sku=pro_monthly&package=com.dropzone.app';

  it('links trial, billing and PRO notices', () => {
    const system = (type: AppNotification['type']) => note('n', { type, actor: null, feedItemId: null });
    expect(notificationLink(system('TRIAL_ENDED'))).toBe('/paywall');
    expect(notificationLink(system('PRO_ENDED'))).toBe('/paywall');
    expect(notificationLink(system('PRO_BACK'))).toBe('/today');
    expect(notificationLink(system('BILLING_ISSUE'), 'pro_monthly:monthly')).toBe(play);
  });

  it('renders the notices and opens Google Play for a billing problem', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
      ]
    });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const body = 'Google Play couldn\'t renew DropZone PRO. Update your payment method to keep PRO.';
    http.expectOne(r => r.url === `${API_URL}/notifications`).flush([
      note('a', { type: 'BILLING_ISSUE', actor: null, feedItemId: null, text: body }),
      note('b', { type: 'PRO_ENDED', actor: null, feedItemId: null, text: 'You\'re on Free now.' }),
      note('c', { type: 'TRIAL_ENDED', actor: null, feedItemId: null, text: 'Pick a plan.' }),
      note('d', { type: 'PRO_BACK', actor: null, feedItemId: null, text: 'Your PRO features are back.' })
    ]);
    const el = fixture.nativeElement as HTMLElement;
    await vi.waitFor(async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el.textContent).toContain('Payment problem');
    });
    const text = el.textContent ?? '';
    expect(text).toContain(body);
    expect(text).not.toContain(`“${body}”`);
    expect(text).toContain('Your PRO subscription ended');
    expect(text).toContain('Your PRO trial has ended');
    expect(text).toContain('Welcome back to PRO');

    (el.querySelector('[role="button"]') as HTMLElement).click();
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/account/subscriptions?package=com.dropzone.app', '_blank');
    open.mockRestore();
  });

  it('opens the report and block sheet from an actor', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
      ]
    });
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(r => r.url === `${API_URL}/notifications`).flush([note('a')]);
    const el = fixture.nativeElement as HTMLElement;
    await vi.waitFor(async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el.querySelector('button[aria-label="Mia"]')).toBeTruthy();
    });
    (el.querySelector('button[aria-label="Mia"]') as HTMLButtonElement).click();
    const prompt = TestBed.inject(PromptService);
    expect(prompt.choice()?.title).toBe('Mia');
    expect(prompt.choice()?.options.map(o => o.key)).toEqual(['report', 'block']);
    prompt.pick(null);
  });
});
