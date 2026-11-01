import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api';
import { ago, when } from '../core/format';
import type { JobView } from '../core/models';
import { Toast } from '../core/toast';
import { Loading } from '../ui/bits';

export const SCHEDULES: Record<string, string> = {
  'daily-reminders': 'Hourly · daily reminder push at 19:00 local time',
  'trial-reminders': 'Hourly · trial ending / ended pushes',
  'deadline-reminders': 'Hourly · milestone deadline pushes',
  'billing-reconcile': 'Daily 03:30 UTC · re-reads RevenueCat for expiring subscriptions',
  'upload-sweep': 'Daily 03:30 UTC · deletes unused uploads older than 2 days',
  'inactive-accounts': 'Daily 03:30 UTC · warns and deletes inactive accounts',
  'notification-retention': 'Daily 03:30 UTC · purges notifications older than 180 days'
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Loading],
  template: `
    <div class="flex items-center gap-4">
      <h1 class="h text-[30px] flex-1">Scheduled jobs</h1>
      <button class="btn btn-ghost btn-sm" (click)="load()" [disabled]="loading()">Refresh</button>
    </div>
    <p class="text-[15px] text-mute mt-2">Run by Cloud Scheduler through <span class="mono">POST /internal/jobs/&lt;name&gt;</span>. A failure stays flagged until the next good run.</p>

    @if (jobs(); as list) {
      <div class="card mt-5 overflow-x-auto">
        <table class="tbl">
          <thead><tr><th>Job</th><th>Schedule</th><th>Last run</th><th>State</th><th>Error</th></tr></thead>
          <tbody>
            @for (j of list; track j.name) {
              <tr>
                <td class="font-bold whitespace-nowrap">{{ j.name }}</td>
                <td class="text-mute">{{ schedules[j.name] ?? '—' }}</td>
                <td class="text-mute whitespace-nowrap">{{ j.lastRunAt ? when(j.lastRunAt) + ' · ' + ago(j.lastRunAt) : 'never' }}</td>
                <td>
                  @if (j.failedAt) { <span class="tag tag-danger">Failed {{ ago(j.failedAt) }}</span> }
                  @else if (j.lastRunAt) { <span class="tag tag-ok">OK</span> }
                  @else { <span class="tag tag-plain">Never ran</span> }
                </td>
                <td class="mono text-danger break-all">{{ j.error ?? '' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (loading()) {
      <div class="mt-5"><adm-loading /></div>
    }
  `
})
export class JobsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(Toast);

  protected readonly jobs = signal<JobView[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly schedules = SCHEDULES;
  protected readonly ago = ago;
  protected readonly when = when;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.jobs.set(await this.api.jobs());
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.loading.set(false);
    }
  }
}
