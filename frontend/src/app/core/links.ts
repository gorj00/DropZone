import { AppNotification } from './api/models';
import { playSubscriptionsUrl } from './config.service';

const REPORT_TARGETS = ['POST', 'COMMENT', 'USER'];
export const TO_VERIFY_LINK = '/squad?show=verify';

export function isExternal(link: string): boolean {
  return /^https?:\/\//.test(link);
}

function appLink(link: unknown, fallback: string): string {
  return typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') ? link : fallback;
}

function playLink(link: unknown, productId: string | null | undefined): string {
  return typeof link === 'string' && link.startsWith('https://play.google.com/') ? link : playSubscriptionsUrl(productId);
}

export function notificationLink(n: AppNotification, productId?: string | null): string | null {
  switch (n.type) {
    case 'TRIAL_ENDING':
    case 'TRIAL_ENDED':
    case 'PRO_ENDED': return '/paywall';
    case 'BILLING_ISSUE': return playSubscriptionsUrl(productId);
    case 'PRO_BACK': return '/today';
    case 'FRIEND_REQUEST':
    case 'FRIEND_ACCEPTED': return '/squad/friends';
    case 'ADMIN_REPORT':
      if (n.commentId) return `/admin/reports/COMMENT/${n.commentId}`;
      if (n.feedItemId) return `/admin/reports/POST/${n.feedItemId}`;
      return '/admin/reports';
    case 'VERIFY':
    case 'PROOF_VERIFIED':
    case 'PROOF_REJECTED':
      if (n.proofId) return `/p/${n.proofId}`;
      break;
  }
  if (n.feedItemId) return `/post/${n.feedItemId}`;
  return n.proofId ? `/p/${n.proofId}` : null;
}

export function pushLink(data: Record<string, unknown> | null | undefined, productId?: string | null): string {
  const d = data ?? {};
  const value = (key: string) => (typeof d[key] === 'string' && d[key] ? (d[key] as string) : null);
  const proofId = value('proofId');
  const feedItemId = value('feedItemId');
  switch (value('type')) {
    case 'VERIFY_REQUEST':
      if (Number(d['count']) > 1) return TO_VERIFY_LINK;
      return proofId ? `/p/${proofId}` : '/squad';
    case 'VERIFIED': return proofId ? `/p/${proofId}` : '/journey';
    case 'PROOF_REJECTED': return proofId ? `/p/${proofId}` : '/today';
    case 'HYPE':
    case 'COMMENT': return feedItemId ? `/post/${feedItemId}` : '/squad';
    case 'FRIEND_REQUEST':
    case 'FRIEND_ACCEPTED': return '/squad/friends';
    case 'ADMIN_REPORT': {
      const type = value('targetType');
      const id = value('targetId');
      return type && id && REPORT_TARGETS.includes(type) ? `/admin/reports/${type}/${id}` : '/admin/reports';
    }
    case 'TRIAL_ENDING':
    case 'TRIAL_ENDED':
    case 'PRO_ENDED': return appLink(d['link'], '/paywall');
    case 'BILLING_ISSUE': return playLink(d['link'], productId);
    case 'DEADLINE_REMINDER': {
      const id = value('checkpointId');
      return appLink(d['link'], id ? `/journey/${id}` : '/journey');
    }
    case 'ACCOUNT_DELETION':
    case 'ACCOUNT_SUSPENDED': return '/today';
    default: return '/today';
  }
}
