import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../core/api/api.service';
import { Checkpoint, Goal, ProofView, Transformation, User } from '../core/api/models';
import { LockService } from '../core/native/lock';
import { ProofService } from '../core/proof.service';
import { SessionStore } from '../core/session.store';
import { CheckpointPage } from '../features/journey/checkpoint';
import { TransformationEditPage } from '../features/profile/transformation-edit';
import { reportedText } from './reported-flag';

const signed = (name: string, sig: string) => `https://storage.googleapis.com/dz/uploads/me/${name}.jpg?X-Goog-Signature=${sig}`;

function providers(api: Record<string, unknown>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ApiService, useValue: api },
      { provide: ProofService, useValue: {} },
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'me', pro: true, onboarded: true, theme: 'NEON', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lockedApps: [] } as unknown as User);
}

describe('Reported flag', () => {
  it('has one short line per state', () => {
    expect(reportedText('UNDER_REVIEW')).toBe('Hidden while we review reports about it.');
    expect(reportedText('REMOVED')).toBe('Removed for breaking the community rules.');
    expect(reportedText(null)).toBeNull();
  });

  describe('before & after', () => {
    const set = (patch: Partial<Transformation> = {}): Transformation => ({
      id: 't1', layout: 'SPLIT', beforeUrl: signed('before', 'a1'), afterUrl: signed('after', 'b1'), beforeCaption: null, afterCaption: null,
      visibility: 'FRIENDS', createdAt: '', updatedAt: '', feedItemId: 'f1', commentCount: 0, hypeCount: 0, moderation: 'UNDER_REVIEW', ...patch
    });

    async function render(t: Transformation) {
      const api = { transformations: vi.fn().mockResolvedValue([t]), updateTransformation: vi.fn().mockResolvedValue(t) };
      providers(api);
      const fixture = TestBed.createComponent(TransformationEditPage);
      fixture.componentRef.setInput('id', 't1');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      return { el, api, fixture, option: (id: string) => el.querySelector<HTMLButtonElement>(`[data-test=vis-${id}]`)! };
    }

    it('turns off the wider choices of a reported set and says why', async () => {
      const { el, option } = await render(set());
      expect(option('EVERYONE').disabled).toBe(true);
      expect(option('FRIENDS').disabled).toBe(false);
      expect(option('PRIVATE').disabled).toBe(false);
      const hint = el.querySelector('[data-test=visibility-hint]')!;
      expect(hint.textContent).toContain('Reported');
      expect(hint.textContent).toContain('Hidden while we review reports about it.');
    });

    it('treats a set removed by a moderator as removed', async () => {
      const { el, option } = await render(set({ moderation: null, removedByModerator: true, visibility: 'PRIVATE' }));
      expect(option('FRIENDS').disabled).toBe(true);
      expect(el.querySelector('[data-test=visibility-hint]')?.textContent).toContain('Removed for breaking the community rules.');
    });

    it('does not send the unchanged photos again when the links were re-signed', async () => {
      const { el, api, fixture } = await render(set({ moderation: null }));
      [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Save')!.click();
      fixture.detectChanges();
      await vi.waitFor(() => expect(api.updateTransformation).toHaveBeenCalled());
      const req = api.updateTransformation.mock.calls[0][1];
      expect(req).not.toHaveProperty('beforeUrl');
      expect(req).not.toHaveProperty('afterUrl');
      expect(req).toMatchObject({ visibility: 'FRIENDS', layout: 'SPLIT' });
    });
  });

  describe('milestone screen', () => {
    const cp = (patch: Partial<Checkpoint>): Checkpoint => ({
      id: 'cp1', index: 1, targetValue: 68, deltaToEarn: 2, rewardTitle: 'Shoes', rewardImageUrl: null, isPublic: false, visibility: 'FRIENDS', verification: 'COMMUNITY',
      deadline: null, status: 'PENDING_VERIFICATION', clearedAt: null, proofId: 'p1', verifiedCount: 1, requiredVerifications: 3, ...patch
    });
    const goal = (c: Checkpoint): Goal => ({ id: 'g1', path: 'LOSE', metric: 'WEIGHT', metricLabel: null, unit: 'kg', startValue: 70, goalValue: 68, currentValue: 68, progressValue: 2, totalValue: 2, checkpoints: [c] });
    const view: ProofView = {
      id: 'p1', kind: 'CHECKPOINT', status: 'PENDING', owner: { id: 'me', displayName: 'Alex', handle: 'alex', avatarUrl: null, path: 'LOSE' }, relation: 'SELF',
      visible: true, post: null, reason: null, moderation: 'UNDER_REVIEW', useAiFrom: new Date(Date.now() + 3_600_000).toISOString()
    };

    it('shows the Reported flag, the visibility and Withdraw on a pending milestone', async () => {
      providers({ goal: vi.fn().mockResolvedValue(goal(cp({ moderation: 'UNDER_REVIEW' }))), proof: vi.fn().mockResolvedValue(view), checkpointSocial: vi.fn().mockResolvedValue({ hypes: { count: 0, users: [] }, alsoChasing: { count: 0, users: [] } }) });
      const fixture = TestBed.createComponent(CheckpointPage);
      fixture.componentRef.setInput('id', 'cp1');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      await vi.waitFor(async () => {
        await fixture.whenStable();
        fixture.detectChanges();
        expect(el.querySelector('[data-test=pending-actions]')).not.toBeNull();
      });
      expect(el.querySelector('[data-test=reported]')?.textContent).toContain('Hidden while we review reports about it.');
      expect(el.querySelector('[data-test=visibility]')?.textContent).toContain('FRIENDS');
      expect(el.querySelector('[data-test=pending-actions]')?.textContent).toContain('Withdraw proof');
      expect(el.querySelector('[data-test=pending-actions]')?.textContent).not.toContain('Use AI check instead');
      expect(el.textContent).toContain('from your friends');
    });

    it('says AI verified or Photo proof on a cleared AI milestone', async () => {
      providers({ goal: vi.fn().mockResolvedValue(goal(cp({ status: 'CLEARED', verification: 'AI', requiredVerifications: 0, proofId: 'p1', aiChecked: false, visibility: 'PRIVATE' }))), checkpointSocial: vi.fn().mockResolvedValue(null) });
      const fixture = TestBed.createComponent(CheckpointPage);
      fixture.componentRef.setInput('id', 'cp1');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-test=proof-badge]')?.textContent?.trim()).toBe('Photo proof');
    });
  });
});
