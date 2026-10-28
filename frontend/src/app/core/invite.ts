import { Injectable, inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { ApiService } from './api/api.service';
import { InviteResult } from './api/models';
import { apiError } from './api/errors';
import { SessionStore } from './session.store';
import { ToastService } from './toast.service';

const INVITE_KEY = 'dz-invite';
const CODE = /^[A-Za-z0-9_-]{1,64}$/;

export function inviteMessage(r: InviteResult): string {
  return r.relation === 'FRIEND'
    ? `You're friends with ${r.user.displayName}.`
    : `Request sent to ${r.user.displayName} — they'll add you when they accept.`;
}

@Injectable({ providedIn: 'root' })
export class PendingInvite {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  constructor() {
    inject(SessionStore).onClear(() => this.clear());
  }

  async remember(code: string): Promise<void> {
    if (CODE.test(code)) await Preferences.set({ key: INVITE_KEY, value: code });
  }

  async get(): Promise<string | null> {
    const { value } = await Preferences.get({ key: INVITE_KEY });
    return value && CODE.test(value) ? value : null;
  }

  async clear(): Promise<void> {
    await Preferences.remove({ key: INVITE_KEY });
  }

  async acceptPending(): Promise<void> {
    const code = await this.get();
    if (!code) return;
    try {
      this.toast.show(inviteMessage(await this.api.acceptInvite(code)));
    } catch (e) {
      if (apiError(e).status === 0) return;
      this.toast.error(e);
    }
    await this.clear();
  }
}

export const rememberInviteGuard: CanActivateFn = route => {
  const code = route.paramMap.get('code');
  return code ? inject(PendingInvite).remember(code).then(() => true, () => true) : true;
};
