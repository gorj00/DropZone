import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from './api/api.service';
import { User } from './api/models';
import { LockService } from './native/lock';
import { PromptService } from './prompt.service';
import { SessionStore } from './session.store';
import { SocialActions } from './social';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const mia = { id: 'u2', displayName: 'Mia', handle: 'mia', avatarUrl: null, path: 'LOSE' as const };

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'me', onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [] } as unknown as User);
  return { social: TestBed.inject(SocialActions), prompt: TestBed.inject(PromptService), http: TestBed.inject(HttpTestingController) };
}

describe('SocialActions.userMenu', () => {
  it('reports a user with a reason', async () => {
    const { social, prompt, http } = setup();
    const result = social.userMenu(mia);
    expect(prompt.choice()?.title).toBe('Mia');
    expect(prompt.choice()?.message).toBe('@mia');
    expect(prompt.choice()?.options.map(o => o.key)).toEqual(['report', 'block']);
    prompt.pick('report');
    await vi.waitFor(() => expect(prompt.choice()?.title).toBe('Why are you reporting this person?'));
    prompt.pick('Impersonation');

    const req = await vi.waitFor(() => http.expectOne(`${API_URL}/reports`));
    expect(req.request.body).toEqual({ targetType: 'USER', targetId: 'u2', reason: 'Impersonation' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(await result).toBe('reported');
  });

  it('blocks a user after the confirm', async () => {
    const { social, prompt, http } = setup();
    const result = social.userMenu(mia);
    prompt.pick('block');
    await vi.waitFor(() => expect(prompt.confirmation()?.title).toBe('Block Mia?'));
    prompt.answer(true);

    const req = await vi.waitFor(() => http.expectOne(`${API_URL}/blocks/u2`));
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(await result).toBe('blocked');
  });

  it('has no menu for myself', async () => {
    const { social, prompt } = setup();
    expect(await social.userMenu({ ...mia, id: 'me' })).toBeNull();
    expect(prompt.choice()).toBeNull();
  });
});
