import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api/api.service';
import { ReportTarget, UserSummary } from './api/models';
import { PromptService } from './prompt.service';
import { SessionStore } from './session.store';
import { ToastService } from './toast.service';

export type MenuResult = 'reported' | 'blocked' | null;

const REASONS = [
  { key: 'Spam', label: 'Spam or scam' },
  { key: 'Nudity', label: 'Nudity or sexual content' },
  { key: 'Harassment', label: 'Harassment or hate' },
  { key: 'Fake', label: 'Fake proof' },
  { key: 'Other', label: 'Something else' }
];

const USER_REASONS = [
  { key: 'Spam', label: 'Spam or scam' },
  { key: 'Nudity', label: 'Nudity or sexual content' },
  { key: 'Harassment', label: 'Harassment or hate' },
  { key: 'Impersonation', label: 'Pretending to be someone else' },
  { key: 'Other', label: 'Something else' }
];

@Injectable({ providedIn: 'root' })
export class SocialActions {
  private readonly api = inject(ApiService);
  private readonly prompt = inject(PromptService);
  private readonly toast = inject(ToastService);
  private readonly session = inject(SessionStore);

  async menu(target: Exclude<ReportTarget, 'USER'>, targetId: string, author: UserSummary): Promise<MenuResult> {
    const what = target === 'POST' ? 'post' : 'comment';
    const action = await this.prompt.choose(author.displayName, [
      { key: 'report', label: `Report ${what}`, icon: 'flag' },
      { key: 'user', label: `Report ${author.displayName}`, icon: 'user' },
      { key: 'block', label: `Block ${author.displayName}`, icon: 'block', danger: true }
    ]);
    if (action === 'report') return (await this.report(target, targetId)) ? 'reported' : null;
    if (action === 'user') return (await this.report('USER', author.id)) ? 'reported' : null;
    if (action === 'block') return (await this.block(author)) ? 'blocked' : null;
    return null;
  }

  async userMenu(user: UserSummary): Promise<MenuResult> {
    if (user.id === this.session.user()?.id) return null;
    const action = await this.prompt.choose(user.displayName, [
      { key: 'report', label: `Report ${user.displayName}`, icon: 'flag' },
      { key: 'block', label: `Block ${user.displayName}`, icon: 'block', danger: true }
    ], `@${user.handle}`);
    if (action === 'report') return (await this.report('USER', user.id)) ? 'reported' : null;
    if (action === 'block') return (await this.block(user)) ? 'blocked' : null;
    return null;
  }

  async report(target: ReportTarget, targetId: string): Promise<boolean> {
    const reason = target === 'USER'
      ? await this.prompt.choose('Why are you reporting this person?', USER_REASONS, 'We review every report and act on profiles that break the rules.')
      : await this.prompt.choose('Why are you reporting this?', REASONS, 'Posts reported by several people, or for nudity, are hidden until we review them.');
    if (!reason) return false;
    try {
      await this.api.report(target, targetId, reason);
      this.toast.show('Thanks. We will review it.');
      return true;
    } catch (e) {
      this.toast.error(e);
      return false;
    }
  }

  async block(user: UserSummary): Promise<boolean> {
    const ok = await this.prompt.confirm(`Block ${user.displayName}?`,
      'You will stop seeing each other’s posts and comments, and they will be removed from your community.', 'Block', 'Cancel');
    if (!ok) return false;
    try {
      await this.api.block(user.id);
      this.toast.show(`${user.displayName} is blocked.`);
      return true;
    } catch (e) {
      this.toast.error(e);
      return false;
    }
  }
}

@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);

  readonly unread = signal(0);

  constructor() {
    this.session.onClear(() => this.reset());
  }

  reset(): void {
    this.unread.set(0);
  }

  async refresh(): Promise<void> {
    if (!this.session.loggedIn()) {
      this.unread.set(0);
      return;
    }
    try {
      this.unread.set((await this.api.unreadNotifications()).count);
    } catch {
      this.unread.set(0);
    }
  }

  async markAllRead(): Promise<void> {
    this.unread.set(0);
    try { await this.api.markNotificationsRead(); } catch { }
  }
}
