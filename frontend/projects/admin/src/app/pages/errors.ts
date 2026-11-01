import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api';
import { ago, when } from '../core/format';
import type { ErrorView } from '../core/models';
import { Toast } from '../core/toast';
import { Empty, Loading } from '../ui/bits';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Empty, Loading],
  template: `
    <div class="flex items-center gap-4">
      <h1 class="h text-[30px] flex-1">Server errors</h1>
      <button class="btn btn-ghost btn-sm" (click)="load()" [disabled]="loading()">Refresh</button>
    </div>
    <p class="text-[15px] text-mute mt-2">Unexpected errors (HTTP 500) of the last 30 days, newest first. Full stack traces are in Cloud Logging.</p>

    @if (errors(); as list) {
      @if (list.length) {
        <div class="card mt-5 overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>When</th><th>Request</th><th>Exception</th><th>Message</th><th>User</th><th>Revision</th></tr></thead>
            <tbody>
              @for (e of list; track e.id) {
                <tr>
                  <td class="whitespace-nowrap text-mute" [title]="when(e.at)">{{ ago(e.at) }}</td>
                  <td class="mono whitespace-nowrap">{{ e.method }} {{ e.path }}</td>
                  <td class="font-bold text-danger whitespace-nowrap">{{ e.exception }}</td>
                  <td class="mono break-all max-w-[480px]">{{ e.message ?? '' }}</td>
                  <td class="whitespace-nowrap">@if (e.userId) { <a class="text-accent2" [routerLink]="['/users', e.userId]">{{ e.email ?? e.userId.slice(0, 8) }}</a> } @else { <span class="text-mute">—</span> }</td>
                  <td class="mono text-mute">{{ e.revision ?? '' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="mt-5"><adm-empty text="No server errors in the last 30 days." /></div>
      }
    } @else if (loading()) {
      <div class="mt-5"><adm-loading /></div>
    }
  `
})
export class ErrorsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(Toast);

  protected readonly errors = signal<ErrorView[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly ago = ago;
  protected readonly when = when;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.errors.set(await this.api.errors(200));
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.loading.set(false);
    }
  }
}
