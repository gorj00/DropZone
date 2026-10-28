import { Checkpoint, ModerationState, PostVisibility } from '../../core/api/models';
import { reportedText } from '../../ui/reported-flag';

export interface VisibilityOption {
  id: PostVisibility;
  label: string;
  hint: string;
  icon: string;
  pro: boolean;
}

export const MILESTONE_VISIBILITY: VisibilityOption[] = [
  { id: 'PRIVATE', label: 'Private', hint: 'Only you · AI check only', icon: 'lock', pro: false },
  { id: 'FRIENDS', label: 'Friends', hint: 'Friends see {delta} and your reward', icon: 'users', pro: true },
  { id: 'EVERYONE', label: 'Everyone', hint: 'Everyone sees {delta} and your reward', icon: 'globe', pro: true }
];

export const COMMUNITY_NEEDS_SHARING = 'Community verification needs a milestone shared with friends or everyone.';
export const PENDING_STAYS_SHARED = 'Withdraw the pending proof first to make it private.';

const RANK: Record<PostVisibility, number> = { PRIVATE: 0, FRIENDS: 1, EVERYONE: 2 };

export function widens(from: PostVisibility, to: PostVisibility): boolean {
  return RANK[to] > RANK[from];
}

export function visibilityOf(cp: Pick<Checkpoint, 'visibility' | 'isPublic'>): PostVisibility {
  return cp.visibility ?? (cp.isPublic ? 'EVERYONE' : 'PRIVATE');
}

export function visibilityIcon(v: PostVisibility): string {
  return v === 'EVERYONE' ? 'globe' : v === 'FRIENDS' ? 'users' : 'eyeoff';
}

export interface VisibilityContext {
  pro: boolean;
  moderation: ModerationState | null | undefined;
  pendingCommunity: boolean;
}

export function visibilityBlock(saved: PostVisibility, target: PostVisibility, ctx: VisibilityContext): 'PRO' | string | null {
  if (target === saved) return null;
  if (widens(saved, target)) {
    const reported = reportedText(ctx.moderation);
    if (reported) return reported;
    if (!ctx.pro) return 'PRO';
  }
  if (target === 'PRIVATE' && ctx.pendingCommunity) return PENDING_STAYS_SHARED;
  return null;
}
