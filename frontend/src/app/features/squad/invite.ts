import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { InviteResult } from '../../core/api/models';
import { PendingInvite } from '../../core/invite';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { Badge } from '../../ui/badge';
import { Avatar } from '../../ui/bits';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Badge, Avatar],
  template: `
    <div class="screen pad items-center justify-center text-center">
      @if (result(); as r) {
        <span class="float"><app-avatar [url]="r.user.avatarUrl" [name]="r.user.displayName" [size]="72" /></span>
        @if (r.relation === 'FRIEND') {
          <div class="h text-[30px] mt-5">You're friends</div>
          <p class="text-[14px] text-mute mt-2 max-w-[300px]">You and {{ r.user.displayName }} are friends.</p>
        } @else {
          <div class="h text-[30px] mt-5">Request sent</div>
          <p class="text-[14px] text-mute mt-2 max-w-[300px]">Request sent to {{ r.user.displayName }} — they'll add you when they accept.</p>
        }
        <a class="btn btn-primary mt-6 max-w-[280px]" routerLink="/squad/friends" [replaceUrl]="true">Go to Friends</a>
      } @else if (failed()) {
        <span class="float"><app-badge tone="accent" [size]="72" icon="users" [glowing]="true" /></span>
        <div class="h text-[30px] mt-5">Invite not valid</div>
        <p class="text-[14px] text-mute mt-2 max-w-[300px]">This link doesn't work anymore. Ask your friend to share their link again.</p>
        <a class="btn btn-ghost mt-6 max-w-[280px]" routerLink="/squad">Go to Community</a>
      } @else {
        <span class="float"><app-badge tone="accent" [size]="72" icon="users" [glowing]="true" /></span>
        <div class="h text-[30px] mt-5">Joining the community…</div>
        <p class="text-[14px] text-mute mt-2">Hang tight, sending your friend request.</p>
      }
    </div>
  `
})
export class InvitePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly pending = inject(PendingInvite);

  readonly code = input.required<string>();
  protected readonly failed = signal(false);
  protected readonly result = signal<InviteResult | null>(null);

  ngOnInit(): void {
    void this.pending.clear().catch(() => undefined);
    void this.accept();
  }

  private async accept(): Promise<void> {
    if (!this.session.pro()) {
      this.toast.show('Friends are a PRO feature. Go PRO to join the community.');
      void this.router.navigateByUrl('/paywall', { replaceUrl: true });
      return;
    }
    try {
      this.result.set(await this.api.acceptInvite(this.code()));
    } catch (e) {
      if (isProRequired(e)) {
        void this.router.navigateByUrl('/paywall', { replaceUrl: true });
        return;
      }
      this.toast.error(e);
      this.failed.set(true);
    }
  }
}
