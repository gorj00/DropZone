import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { apiError } from './api/errors';
import { CheckAudience } from './api/models';
import { ChoiceOption, PromptService } from './prompt.service';

export const QUEST_CHECK_HOW = "3 people verify each photo. Until then the day counts as unlocked, and your streak counts once it's verified.";
export const MILESTONE_CHECK_HOW = '3 people verify your proof photo and the milestone clears once they have. You can withdraw it anytime, or switch to the AI check after 48 hours.';
export const AUDIENCE_HOW = "Friends: only your friends see it and verify it. Everyone: it's public and anyone on PRO can verify it.";
export const NEED_FRIENDS_TEXT = 'Friends check needs at least 3 friends to verify your photos. Add friends, or let everyone verify instead.';

export type AudienceChoice = CheckAudience | 'OFF';

export function isNeedFriends(e: unknown): boolean {
  const err = apiError(e);
  return err.status === 400 && /at least 3 friends/i.test(err.message);
}

export function audienceLabel(a: CheckAudience | null | undefined): string {
  return a === 'EVERYONE' ? 'Everyone verifies' : 'Friends verify';
}

@Injectable({ providedIn: 'root' })
export class AudienceService {
  private readonly prompt = inject(PromptService);
  private readonly router = inject(Router);

  async choose(kind: 'quest' | 'milestone', current: CheckAudience | null = null, allowOff = false): Promise<AudienceChoice | null> {
    const mark = (a: CheckAudience, label: string) => (current === a ? `${label} · current` : label);
    const options: ChoiceOption[] = [
      { key: 'FRIENDS', label: mark('FRIENDS', 'Friends'), icon: 'users' },
      { key: 'EVERYONE', label: mark('EVERYONE', 'Everyone'), icon: 'globe' }
    ];
    if (allowOff) options.push({ key: 'OFF', label: 'Turn Friends check off', icon: 'close', danger: true });
    const how = kind === 'quest' ? QUEST_CHECK_HOW : MILESTONE_CHECK_HOW;
    const key = await this.prompt.choose(kind === 'quest' ? 'Friends check' : 'Community verification', options, `${how} ${AUDIENCE_HOW}`);
    return key === 'FRIENDS' || key === 'EVERYONE' || key === 'OFF' ? key : null;
  }

  async needFriends(): Promise<CheckAudience | null> {
    const key = await this.prompt.choose('Add 3 friends first', [
      { key: 'friends', label: 'Add friends', icon: 'userplus' },
      { key: 'everyone', label: 'Let everyone verify', icon: 'globe' }
    ], NEED_FRIENDS_TEXT);
    if (key === 'friends') void this.router.navigateByUrl('/squad/friends');
    return key === 'everyone' ? 'EVERYONE' : null;
  }
}
