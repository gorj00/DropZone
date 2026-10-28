import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { DailyLog, DayLogs } from '../../core/api/models';
import { PhotoLinks } from '../../core/photo-links';
import { ToastService } from '../../core/toast.service';
import { UnitsService } from '../../core/units';
import { Icon } from '../../ui/icon';
import { dayLabel, logTime, logTitle, logValue } from './log-format';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <div class="screen">
      <div class="pad pt-3 flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="flex-1 min-w-0">
          <div class="lbl">Daily log</div>
          <div class="h text-[26px] truncate">{{ label() }}</div>
        </div>
      </div>

      @if (day(); as d) {
        <div class="mx-5 mt-4 card p-4 flex items-center gap-4">
          <div class="num text-[34px] leading-none" [class.text-ok]="d.totalCount > 0 && d.doneCount >= d.totalCount">{{ d.doneCount }}/{{ d.totalCount }}</div>
          <div class="text-[13px] text-mute leading-snug">{{ d.totalCount > 0 && d.doneCount >= d.totalCount ? 'All quests cleared' : 'quests cleared' }}</div>
        </div>
        <div class="pad mt-3 mb-8 space-y-2">
          @for (l of d.logs; track l.id) {
            <a class="q" [routerLink]="['/log', l.id]">
              <span class="qi relative overflow-hidden bg-[rgba(var(--accent-2-rgb),.12)] text-accent2">
                @if (l.photoUrl) { <img class="absolute inset-0 w-full h-full object-cover" [src]="l.photoUrl" alt="" loading="lazy"> } @else { <app-icon [name]="l.quest.icon" /> }
              </span>
              <div class="flex-1 min-w-0">
                <div class="qt truncate">{{ title(l) }}</div>
                <div class="qs truncate">{{ subtitle(l) }}</div>
              </div>
              @switch (l.status) {
                @case ('DONE') { <span class="qok"><app-icon name="check" /></span> }
                @case ('PENDING') { <span class="qwait"><app-icon name="hourglass" />{{ l.verifiedCount }}/{{ l.requiredVerifications }}</span> }
                @default { <span class="text-mute inline-flex"><app-icon name="chev" [size]="16" /></span> }
              }
            </a>
          } @empty {
            <div class="card p-6 text-center">
              <div class="font-bold text-[15px]">Nothing logged this day</div>
              <p class="text-[13px] text-mute mt-1">Quests you prove show up here.</p>
            </div>
          }
        </div>
      } @else if (failed()) {
        <div class="mx-5 mt-6 card p-5 text-center">
          <div class="font-bold">Couldn't load this day</div>
          <button class="btn btn-ghost btn-sm mx-auto mt-3" (click)="load()"><app-icon name="refresh" />Retry</button>
        </div>
      } @else {
        <div class="mx-5 mt-4 skeleton h-[72px]"></div>
        <div class="pad mt-3 space-y-2">
          @for (i of [0, 1, 2]; track i) { <div class="skeleton h-[62px]"></div> }
        </div>
      }
    </div>
  `
})
export class DayLogsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly units = inject(UnitsService);
  private readonly location = inject(Location);

  readonly date = input.required<string>();

  protected readonly day = signal<DayLogs | null>(null);
  protected readonly failed = signal(false);
  protected readonly label = computed(() => (/^\d{4}-\d{2}-\d{2}$/.test(this.date()) ? dayLabel(this.date()) : 'Daily log'));

  constructor() {
    inject(PhotoLinks).onStale(() => this.load());
  }

  ngOnInit(): void {
    void this.load();
  }

  protected back(): void {
    this.location.back();
  }

  protected title(l: DailyLog): string {
    return logTitle(l);
  }

  protected subtitle(l: DailyLog): string {
    return [logValue(l, this.units) ?? l.summary, logTime(l.createdAt)].filter(Boolean).join(' · ');
  }

  protected async load(): Promise<void> {
    this.failed.set(false);
    try {
      this.day.set(await this.api.dayLogs(this.date()));
    } catch (e) {
      this.failed.set(true);
      this.toast.error(e);
    }
  }
}
