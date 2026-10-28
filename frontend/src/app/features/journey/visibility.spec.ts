import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Checkpoint, Goal, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { GoalStore } from '../../core/stores';
import { CheckpointEditPage } from './checkpoint-edit';
import { COMMUNITY_NEEDS_SHARING, PENDING_STAYS_SHARED, visibilityBlock } from './visibility';

const signed = (sig: string) => `https://storage.googleapis.com/dz/uploads/me/reward.jpg?X-Goog-Date=20261028T060000Z&X-Goog-Expires=46800&X-Goog-Signature=${sig}`;

const cp = (patch: Partial<Checkpoint> = {}): Checkpoint => ({
  id: 'cp1', index: 1, targetValue: 68, deltaToEarn: 2, rewardTitle: 'Shoes', rewardImageUrl: signed('aa'), isPublic: false, visibility: 'PRIVATE',
  verification: 'AI', deadline: null, status: 'ACTIVE', clearedAt: null, proofId: null, verifiedCount: 0, requiredVerifications: 0, moderation: null, ...patch
});

const goal = (c: Checkpoint): Goal => ({
  id: 'g1', path: 'LOSE', metric: 'WEIGHT', metricLabel: null, unit: 'kg', startValue: 70, goalValue: 64, currentValue: 69, progressValue: 1, totalValue: 6,
  checkpoints: [c, cp({ id: 'cp2', index: 2, targetValue: 64, deltaToEarn: 6, status: 'LOCKED', rewardImageUrl: null })]
});

describe('visibilityBlock', () => {
  const ctx = { pro: true, moderation: null, pendingCommunity: false };

  it('needs PRO to widen and never to narrow', () => {
    expect(visibilityBlock('PRIVATE', 'FRIENDS', { ...ctx, pro: false })).toBe('PRO');
    expect(visibilityBlock('FRIENDS', 'EVERYONE', { ...ctx, pro: false })).toBe('PRO');
    expect(visibilityBlock('EVERYONE', 'PRIVATE', { ...ctx, pro: false })).toBeNull();
    expect(visibilityBlock('EVERYONE', 'FRIENDS', { ...ctx, pro: false })).toBeNull();
    expect(visibilityBlock('PRIVATE', 'EVERYONE', ctx)).toBeNull();
  });

  it('refuses to widen a reported milestone and to hide one with a pending community proof', () => {
    expect(visibilityBlock('FRIENDS', 'EVERYONE', { ...ctx, moderation: 'UNDER_REVIEW' })).toBe('Hidden while we review reports about it.');
    expect(visibilityBlock('PRIVATE', 'FRIENDS', { ...ctx, pro: false, moderation: 'REMOVED' })).toBe('Removed for breaking the community rules.');
    expect(visibilityBlock('FRIENDS', 'PRIVATE', { ...ctx, moderation: 'UNDER_REVIEW' })).toBeNull();
    expect(visibilityBlock('FRIENDS', 'PRIVATE', { ...ctx, pendingCommunity: true })).toBe(PENDING_STAYS_SHARED);
  });
});

describe('Milestone visibility control', () => {
  function setup(c: Checkpoint, pro: boolean) {
    const api = {
      goal: vi.fn().mockResolvedValue(goal(c)),
      searchPhotos: vi.fn().mockResolvedValue([]),
      trackPhotoDownload: vi.fn().mockResolvedValue(undefined),
      updateCheckpoint: vi.fn().mockImplementation((_id: string, patch: Partial<Checkpoint>) => Promise.resolve({ ...c, ...patch }))
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: ApiService, useValue: api },
        { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
      ]
    });
    TestBed.inject(SessionStore).setUser({ id: 'me', pro, onboarded: true, theme: 'NEON', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lockedApps: [] } as unknown as User);
    TestBed.inject(GoalStore).goal.set(goal(c));
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigateByUrl');
    const fixture = TestBed.createComponent(CheckpointEditPage);
    fixture.componentRef.setInput('id', 'cp1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const option = (id: string) => el.querySelector<HTMLButtonElement>(`[data-test=vis-${id}]`)!;
    const save = () => [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Save')!;
    const refresh = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, el, api, nav, option, save, refresh, prompt: TestBed.inject(PromptService) };
  }

  it('shows three options with PRO on Friends and Everyone for free users and sends them to the paywall', async () => {
    const { option, nav, el, refresh } = setup(cp(), false);
    await refresh();
    expect(option('PRIVATE').getAttribute('aria-checked')).toBe('true');
    expect(option('FRIENDS').textContent).toContain('PRO');
    expect(option('EVERYONE').textContent).toContain('PRO');
    expect(option('PRIVATE').textContent).not.toContain('PRO');
    option('FRIENDS').click();
    expect(nav).toHaveBeenCalledWith('/paywall');
    expect(option('PRIVATE').getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector<HTMLButtonElement>('[data-test=community]')!.disabled).toBe(true);
    expect(el.querySelector('[data-test=community-hint]')?.textContent?.trim()).toBe(COMMUNITY_NEEDS_SHARING);
  });

  it('lets a free user go back to Private and saves only what changed', async () => {
    const { option, nav, save, api, refresh, fixture } = setup(cp({ visibility: 'EVERYONE', isPublic: true }), false);
    await refresh();
    option('PRIVATE').click();
    fixture.detectChanges();
    expect(nav).not.toHaveBeenCalledWith('/paywall');
    expect(option('PRIVATE').getAttribute('aria-checked')).toBe('true');
    TestBed.inject(GoalStore).goal.set(goal(cp({ visibility: 'EVERYONE', isPublic: true, rewardImageUrl: signed('bb') })));
    fixture.detectChanges();
    save().click();
    await vi.waitFor(() => expect(api.updateCheckpoint).toHaveBeenCalled());
    const patch = api.updateCheckpoint.mock.calls[0][1];
    expect(patch).toMatchObject({ visibility: 'PRIVATE' });
    expect(patch).not.toHaveProperty('rewardImageUrl');
    expect(patch).not.toHaveProperty('rewardImageCredit');
    expect(patch).not.toHaveProperty('isPublic');
  });

  it('turns the wider options off while the milestone is reported and says why', async () => {
    const { option, el, refresh } = setup(cp({ visibility: 'FRIENDS', moderation: 'UNDER_REVIEW' }), true);
    await refresh();
    expect(option('EVERYONE').disabled).toBe(true);
    expect(option('FRIENDS').disabled).toBe(false);
    expect(option('PRIVATE').disabled).toBe(false);
    expect(el.querySelector('[data-test=visibility-hint]')?.textContent?.trim()).toBe('Hidden while we review reports about it.');
  });

  it('explains community verification and lets the user pick Friends or Everyone', async () => {
    const { option, el, refresh, prompt, fixture, save, api } = setup(cp({ visibility: 'FRIENDS' }), true);
    await refresh();
    el.querySelector<HTMLButtonElement>('[data-test=community]')!.click();
    await vi.waitFor(() => expect(prompt.choice()?.title).toBe('Community verification'));
    expect(prompt.choice()?.message).toContain('3 people verify your proof photo');
    expect(prompt.choice()?.options.map(o => o.label)).toEqual(['Friends · current', 'Everyone']);
    prompt.pick('EVERYONE');
    await refresh();
    expect(option('EVERYONE').getAttribute('aria-checked')).toBe('true');
    fixture.detectChanges();
    save().click();
    await vi.waitFor(() => expect(api.updateCheckpoint).toHaveBeenCalled());
    expect(api.updateCheckpoint.mock.calls[0][1]).toMatchObject({ visibility: 'EVERYONE', verification: 'COMMUNITY' });
  });

  it('sends a newly picked reward photo with its credit', async () => {
    const { refresh, save, api, fixture } = setup(cp(), true);
    await refresh();
    const page = fixture.componentInstance as unknown as { onPicked(t: unknown): void; title: { set(v: string): void } };
    page.title.set('Shoes');
    page.onPicked({ url: 'https://images.unsplash.com/photo-1?w=1080', thumb: '', credit: { name: 'Ann', link: 'https://unsplash.com/@ann' }, unsplashId: 'x1' });
    fixture.detectChanges();
    save().click();
    await vi.waitFor(() => expect(api.updateCheckpoint).toHaveBeenCalled());
    expect(api.updateCheckpoint.mock.calls[0][1]).toMatchObject({ rewardImageUrl: 'https://images.unsplash.com/photo-1?w=1080', rewardImageCredit: { name: 'Ann', link: 'https://unsplash.com/@ann' } });
  });
});
