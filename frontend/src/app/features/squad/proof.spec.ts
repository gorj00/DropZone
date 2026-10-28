import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { FeedItem, ProofView, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { ProofPage, proofHiddenText } from './proof';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const mia = { id: 'u2', displayName: 'Mia Tran', handle: 'mia', avatarUrl: null, path: 'LOSE' as const };

function view(patch: Partial<ProofView> = {}): ProofView {
  return { id: 'p1', kind: 'QUEST', status: 'PENDING', owner: mia, relation: 'NONE', visible: false, post: null, reason: 'FRIENDS_ONLY', ...patch };
}

const post: FeedItem = {
  id: 'f1', type: 'QUEST_PROOF', user: mia, createdAt: new Date().toISOString(), photoUrl: null, title: 'Healthy meal', subtitle: null, deltaValue: null,
  value: null, unit: null, proofId: 'p1', verification: { required: 3, count: 1, verifiedByMe: false, canVerify: false }, hypeCount: 0, hypedByMe: false,
  commentCount: 0, transformation: null, hidden: false, aiChecked: false, isPublic: false
};

async function render(v: ProofView): Promise<string> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: { proof: vi.fn().mockResolvedValue(v) } },
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'me', pro: true, onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [] } as unknown as User);
  const fixture = TestBed.createComponent(ProofPage);
  fixture.componentRef.setInput('id', 'p1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
}

describe('proofHiddenText', () => {
  it('explains why a proof is not shown', () => {
    expect(proofHiddenText('FRIENDS_ONLY', 'Mia')).toContain("Only Mia's friends can see");
    expect(proofHiddenText('UNDER_REVIEW', 'Mia')).toBe('This post is under review.');
    expect(proofHiddenText('REMOVED', 'Mia')).toBe('This post was removed.');
  });
});

describe('ProofPage', () => {
  it('offers Add friend for a friends-only proof of a stranger', async () => {
    const text = await render(view());
    expect(text).toContain("Only Mia's friends can see and verify this proof");
    expect(text).toContain('Add friend');
  });

  it('tells a friend that a hidden post is under review, without Add friend', async () => {
    const text = await render(view({ relation: 'FRIEND', reason: 'UNDER_REVIEW' }));
    expect(text).toContain('This post is under review.');
    expect(text).not.toContain('Add friend');
    expect(text).not.toContain("friends can see");
  });

  it('says a removed post was removed, without Add friend', async () => {
    const text = await render(view({ reason: 'REMOVED' }));
    expect(text).toContain('This post was removed.');
    expect(text).not.toContain('Add friend');
  });

  it('shows the owner that a rejected proof was removed and hides sharing', async () => {
    const text = await render(view({ relation: 'SELF', visible: true, reason: null, status: 'REJECTED', owner: { ...mia, id: 'me' }, post }));
    expect(text).toContain('REMOVED');
    expect(text).toContain('Upload a new one to finish it.');
    expect(text).not.toContain('Share to get verified');
    expect(text).not.toContain('WAITING');
  });
});
