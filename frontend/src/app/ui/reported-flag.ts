import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ModerationState } from '../core/api/models';
import { Icon } from './icon';

export function reportedText(state: ModerationState | null | undefined): string | null {
  switch (state) {
    case 'UNDER_REVIEW': return 'Hidden while we review reports about it.';
    case 'REMOVED': return 'Removed for breaking the community rules.';
    default: return null;
  }
}

@Component({
  selector: 'app-reported-flag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { style: 'display:contents' },
  template: `
    @if (text(); as t) {
      <div class="flex items-center gap-2 min-w-0" data-test="reported">
        <span class="tag tag-accent flex-none"><app-icon name="flag" />Reported</span>
        <span class="text-[12px] text-mute leading-snug min-w-0">{{ t }}</span>
      </div>
    }
  `
})
export class ReportedFlag {
  readonly state = input<ModerationState | null | undefined>(null);
  protected readonly text = computed(() => reportedText(this.state()));
}
