import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { LockService } from '../core/native/lock';
import { Icon } from './icon';

@Component({
  selector: 'app-ap-warning',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @if (lock.blocked()) {
      <div class="card-gold p-3.5 flex items-start gap-3" role="alert">
        <span class="qi bg-[rgba(var(--gold-rgb),.12)] text-gold shrink-0"><app-icon name="lock" /></span>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-[14.5px] leading-tight">App locks can't work on this phone</div>
          <p class="text-[12.5px] text-mute leading-snug mt-1">
            Android Advanced Protection is on, and it blocks the accessibility access DropZone needs to lock apps.
            {{ purchase() ? 'Quests, goals and community features still work, but locked apps stay open until you turn Advanced Protection off.' : 'Turn it off in Settings › Security to use app locks.' }}
          </p>
        </div>
      </div>
    }
  `
})
export class ApWarning {
  protected readonly lock = inject(LockService);
  readonly purchase = input(false);
}
