import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api';
import { ago, when } from '../core/format';
import type { BillingEventView } from '../core/models';
import { Toast } from '../core/toast';
import { Empty, Loading } from '../ui/bits';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Empty, Loading],
  template: `
    <div class="flex items-center gap-4">
      <h1 class="h text-[30px] flex-1">Billing events</h1>
      <button class="btn btn-ghost btn-sm" (click)="load()" [disabled]="loading()">Refresh</button>
    </div>
    <p class="text-[13px] text-mute mt-2">RevenueCat webhook events as received, newest first. Each event id is applied once.</p>

    @if (events(); as list) {
      @if (list.length) {
        <div class="card mt-5 overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>Received</th><th>Type</th><th>Environment</th><th>User</th><th>Event id</th></tr></thead>
            <tbody>
              @for (e of list; track e.id) {
                <tr>
                  <td class="whitespace-nowrap text-mute" [title]="when(e.receivedAt)">{{ when(e.receivedAt) }} · {{ ago(e.receivedAt) }}</td>
                  <td><span class="tag" [class.tag-ok]="e.type === 'INITIAL_PURCHASE' || e.type === 'RENEWAL' || e.type === 'UNCANCELLATION'" [class.tag-danger]="e.type === 'CANCELLATION' || e.type === 'EXPIRATION' || e.type === 'BILLING_ISSUE'" [class.tag-plain]="e.type !== 'INITIAL_PURCHASE' && e.type !== 'RENEWAL' && e.type !== 'UNCANCELLATION' && e.type !== 'CANCELLATION' && e.type !== 'EXPIRATION' && e.type !== 'BILLING_ISSUE'">{{ e.type }}</span></td>
                  <td class="text-mute">{{ e.environment ?? '—' }}</td>
                  <td>@if (e.email) { <a class="text-accent2" [routerLink]="['/users', e.appUserId]">{{ e.email }}</a> } @else { <span class="mono text-mute">{{ e.appUserId ?? '—' }}</span> }</td>
                  <td class="mono text-mute">{{ e.id }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="mt-5"><adm-empty text="No billing events yet." /></div>
      }
    } @else if (loading()) {
      <div class="mt-5"><adm-loading /></div>
    }
  `
})
export class BillingPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(Toast);

  protected readonly events = signal<BillingEventView[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly ago = ago;
  protected readonly when = when;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.events.set(await this.api.billingEvents(200));
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.loading.set(false);
    }
  }
}
