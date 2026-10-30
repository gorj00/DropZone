import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { Location, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { App as CapApp } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { LengthUnit, QuestPatch, Theme, UnlockMode, User, UserPatch, UserQuest, UserSummary, Verification, WeightUnit } from '../../core/api/models';
import { AudienceService, audienceLabel, isNeedFriends } from '../../core/audience';
import { AuthService } from '../../core/auth';
import { AvatarService } from '../../core/avatar.service';
import { ConfigService, openExternal, playSubscriptionsUrl } from '../../core/config.service';
import { DataExportService } from '../../core/data-export';
import { BillingService, planLabel } from '../../core/native/billing';
import { HealthService } from '../../core/native/health';
import { LockService } from '../../core/native/lock';
import { PushService } from '../../core/native/push';
import { PromptService } from '../../core/prompt.service';
import { RegionService } from '../../core/region';
import { SessionStore } from '../../core/session.store';
import { CatalogStore, GoalStore, TodayStore } from '../../core/stores';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { trialEnd, trialLeft } from '../../core/trial';
import { ApWarning } from '../../ui/ap-warning';
import { AppTile, LOCKABLE_APPS, LockableApp } from '../../ui/app-tile';
import { Avatar, ProTag } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { ProfileForm, cleanHandle } from '../../ui/profile-form';
import { GoalKind, QuestSchedule, daysLabel, goalKindOf, goalOf, goalText } from '../../ui/quest-schedule';
import { DeleteAccountSheet } from './delete-account';

type Section = 'apps' | 'unlock' | 'quests' | 'verify' | 'blocked';
type Flag = 'hiddenFromSearch' | 'hiddenFromLeaderboards' | 'verifyRequestPushes' | 'shareStats';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet, AppTile, Avatar, ProTag, Icon, ApWarning, QuestSchedule, ProfileForm, DeleteAccountSheet],
  template: `
    <div class="screen pb-[calc(32px+env(safe-area-inset-bottom))]">
      <div class="pad h-[58px] flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[28px] [[data-theme=stealth]_&]:text-[32px]">Settings</div>
      </div>

      <div class="pad mt-2">
        <div class="lbl mb-2">Profile</div>
        <div class="card px-3.5 py-4">
          @if (user(); as u) {
            <div class="flex items-center gap-3 mb-4">
              <app-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="56" />
              <div class="flex-1 min-w-0">
                <div class="font-bold text-[14.5px] leading-tight">Profile photo</div>
                <div class="text-[12px] text-mute">{{ u.avatarUrl ? 'Tap change to pick a new one' : 'Showing your initials' }}</div>
              </div>
              <button class="btn btn-ghost btn-sm !w-auto !px-3" [disabled]="avatar.busy()" (click)="avatar.change()">{{ avatar.busy() ? 'Saving…' : 'Change' }}</button>
            </div>
          }
          <app-profile-form [(name)]="profileName" [(handle)]="profileHandle" [(bio)]="profileBio" />
          <button class="btn btn-primary btn-sm mt-4" [disabled]="busy() || !profileDirty() || !profileForm()?.valid()" (click)="saveProfile()">Save profile</button>
        </div>
      </div>

      <div class="pad mt-4">
        <div class="lbl mb-2">Theme</div>
        <div class="grid grid-cols-2 gap-2.5">
          @for (t of themes; track t.id) {
            <button class="rounded-[16px] overflow-hidden text-left" (click)="setTheme(t.id)"
              [class]="theme.theme() === t.id ? 'border-[1.5px] border-accent shadow-[0_0_24px_-8px_rgba(var(--accent-rgb),.85)]' : 'border border-line'">
              @if (t.id === 'NEON') {
                <div class="h-[112px] relative" style="background:radial-gradient(120% 70% at 50% 0%,#2e2290,transparent 62%),#0d0a2b">
                  <div class="absolute left-3 top-3 text-[13px] text-white" style="font-family:Oswald,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Drop<span style="color:#ff2e7e">Zone</span></div>
                  <svg class="absolute right-3 top-2.5" width="22" height="25" viewBox="0 0 64 72"><path d="M32 2 L60 12 V36 C60 53 47 64 32 70 C17 64 4 53 4 36 V12Z" fill="#ff2e7e" stroke="#ffd0e2" stroke-width="2"/></svg>
                  <div class="absolute left-3 top-[34px] w-[58%] h-[7px] rounded-full bg-white/80"></div>
                  <div class="absolute left-3 top-[47px] w-[40%] h-[5px] rounded-full bg-white/25"></div>
                  <div class="absolute left-3 top-[62px] flex gap-1"><i class="block w-3 h-3 rounded-full" style="background:#ff2e7e;box-shadow:0 0 6px #ff2e7e"></i><i class="block w-3 h-3 rounded-full" style="background:#3df0ff"></i><i class="block w-3 h-3 rounded-full" style="background:#8b5cff"></i></div>
                  <div class="absolute left-3 right-3 bottom-3 h-[18px] rounded-[6px]" style="background:linear-gradient(180deg,#ff4b91,#ff1f6d);box-shadow:0 4px 12px -4px rgba(255,46,126,.9)"></div>
                </div>
              } @else {
                <div class="h-[112px] relative" style="background:#08090c">
                  <div class="absolute left-3 top-3 text-[14px] text-white" style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-style:italic;text-transform:uppercase;letter-spacing:.08em">Drop<span style="color:#ff5a1f">Zone</span></div>
                  <div class="absolute right-3 top-3 w-[18px] h-[18px] rounded-full" style="background:#c6ff3a;box-shadow:0 0 8px rgba(198,255,58,.6)"></div>
                  <div class="absolute left-3 top-[34px] w-[58%] h-[7px] rounded-full bg-white/80"></div>
                  <div class="absolute left-3 top-[47px] w-[40%] h-[5px] rounded-full bg-white/20"></div>
                  <div class="absolute left-3 top-[62px] flex gap-1"><i class="block w-3 h-3 rounded-full" style="background:#ff5a1f"></i><i class="block w-3 h-3 rounded-full" style="background:#c6ff3a"></i><i class="block w-3 h-3 rounded-full" style="background:#ffc53d"></i></div>
                  <div class="absolute left-3 right-3 bottom-3 h-[18px] rounded-[6px]" style="background:linear-gradient(180deg,#ff7b35,#ff4d14)"></div>
                </div>
              }
              <div class="px-3 py-2.5 flex items-center justify-between bg-s1">
                <div><div class="font-bold text-[14.5px]">{{ t.name }}</div><div class="text-[11px] text-mute">{{ t.sub }}</div></div>
                <span class="radio !w-5 !h-5" [class.on]="theme.theme() === t.id"></span>
              </div>
            </button>
          }
        </div>
      </div>

      @if (user(); as u) {
        <div class="pad mt-4">
          <div class="lbl mb-2">Units</div>
          <div class="card px-3.5 py-3 grid grid-cols-2 gap-2.5">
            <div>
              <div class="text-[12px] text-mute font-semibold mb-1.5">Weight</div>
              <div class="seg3 grid-cols-2" role="group" aria-label="Weight unit">
                <button [class.on]="u.weightUnit === 'KG'" [attr.aria-pressed]="u.weightUnit === 'KG'" [disabled]="busy()" (click)="setUnits({ weightUnit: 'KG' })">kg</button>
                <button [class.on]="u.weightUnit === 'LB'" [attr.aria-pressed]="u.weightUnit === 'LB'" [disabled]="busy()" (click)="setUnits({ weightUnit: 'LB' })">lb</button>
              </div>
            </div>
            <div>
              <div class="text-[12px] text-mute font-semibold mb-1.5">Length</div>
              <div class="seg3 grid-cols-2" role="group" aria-label="Length unit">
                <button [class.on]="u.lengthUnit === 'CM'" [attr.aria-pressed]="u.lengthUnit === 'CM'" [disabled]="busy()" (click)="setUnits({ lengthUnit: 'CM' })">cm</button>
                <button [class.on]="u.lengthUnit === 'IN'" [attr.aria-pressed]="u.lengthUnit === 'IN'" [disabled]="busy()" (click)="setUnits({ lengthUnit: 'IN' })">in</button>
              </div>
            </div>
          </div>
        </div>

        <div class="pad mt-4">
          <div class="lbl mb-2">Plan</div>
          @if (u.billingIssue || u.billingHold) {
            <button class="w-full card-gold p-3.5 mb-2.5 flex items-center gap-3 text-left" (click)="fixPayment()">
              <span class="qi bg-[rgba(var(--gold-rgb),.12)] text-gold"><app-icon name="coins" /></span>
              <span class="flex-1 min-w-0 font-bold text-[14px] leading-snug">{{ u.billingHold ? 'PRO is on hold — fix your payment in Google Play to get it back' : 'Payment problem — fix it in Google Play to keep PRO' }}</span>
              <span class="text-mute inline-flex"><app-icon name="chev" [size]="16" /></span>
            </button>
          }
          <div class="card divide-y divide-line">
            <button class="w-full px-3.5 h-[56px] flex items-center gap-3 text-left" (click)="plan()">
              <span class="qi !w-[34px] !h-[34px] !rounded-[10px] bg-[rgba(var(--gold-rgb),.12)] text-gold"><app-icon name="crown" [size]="17" /></span>
              <span class="flex-1 min-w-0">
                <span class="block font-bold text-[14.5px] leading-tight">{{ planTitle() }}</span>
                <span class="block text-[12px] text-mute truncate">{{ planSub() }}</span>
              </span>
              @if (!u.pro) { <span class="tag tag-pro">Go PRO</span> } @else if (u.trial) { <span class="tag tag-pro">Subscribe</span> }
              <span class="text-mute inline-flex"><app-icon name="chev" [size]="16" /></span>
            </button>
            <button class="w-full px-3.5 h-[46px] flex items-center gap-3 text-left text-[13.5px] font-semibold text-mute" [disabled]="busy()" (click)="restore()">
              <app-icon name="refresh" [size]="16" /><span class="flex-1">Restore purchases</span>
            </button>
          </div>
        </div>

        <div class="pad mt-4">
          <div class="lbl mb-2">Quests &amp; locks</div>
          <div class="card divide-y divide-line">
            <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left" (click)="toggle('apps')">
              <span class="flex-1 font-semibold text-[14.5px]">Locked apps</span>
              <span class="flex">
                @for (a of apps; track a.pkg; let i = $index) {
                  <span [class.-ml-1]="i > 0" [class.opacity-30]="!u.lockedApps.includes(a.pkg)"><app-tile [key]="a.key" [size]="20" /></span>
                }
              </span>
              <span class="text-mute inline-flex transition-transform" [class.rotate-90]="open() === 'apps'"><app-icon name="chev" [size]="16" /></span>
            </button>
            @if (open() === 'apps') {
              <div class="px-3.5 py-1.5 bg-[rgba(0,0,0,.12)]">
                @for (a of apps; track a.pkg) {
                  <button class="w-full flex items-center gap-3 h-[48px] text-left" (click)="toggleApp(a)">
                    <app-tile [key]="a.key" [size]="30" />
                    <span class="flex-1 font-semibold text-[14px] flex items-center gap-1.5">{{ a.name }}@if (!a.free && !u.pro) { <app-pro-tag /> }</span>
                    <span class="tog" [class.on]="u.lockedApps.includes(a.pkg)" [class.disabled]="!a.free && !u.pro"></span>
                  </button>
                }
              </div>
            }

            <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left" (click)="toggle('unlock')">
              <span class="flex-1 font-semibold text-[14.5px]">Unlock mode</span>
              <span class="text-[13px] text-mute font-semibold">{{ u.unlockMode === 'MINUTES' ? u.minutesPerQuest + ' min / quest' : 'Whole day' }}</span>
              <span class="text-mute inline-flex transition-transform" [class.rotate-90]="open() === 'unlock'"><app-icon name="chev" [size]="16" /></span>
            </button>
            @if (open() === 'unlock') {
              <div class="px-3.5 py-2 bg-[rgba(0,0,0,.12)] space-y-1">
                <button class="w-full flex items-center gap-3 py-2 text-left" (click)="setUnlock('WHOLE_DAY')">
                  <span class="radio" [class.on]="u.unlockMode === 'WHOLE_DAY'"></span>
                  <span class="flex-1"><span class="block font-semibold text-[14px]">Whole day</span><span class="block text-[12px] text-mute">Clear all quests, scroll until midnight</span></span>
                </button>
                <button class="w-full flex items-center gap-3 py-2 text-left" (click)="setUnlock('MINUTES')">
                  <span class="radio" [class.on]="u.unlockMode === 'MINUTES'"></span>
                  <span class="flex-1"><span class="flex items-center gap-1.5 font-semibold text-[14px]">Minutes<app-pro-tag /></span><span class="block text-[12px] text-mute">Earn minutes for every quest you clear</span></span>
                </button>
                @if (u.unlockMode === 'MINUTES') {
                  <div class="lbl pt-1">Minutes per quest</div>
                  <div class="grid grid-cols-4 gap-2 pb-2">
                    @for (m of minuteOptions; track m) {
                      <button class="opt sm" [class.on]="u.minutesPerQuest === m" (click)="patch({ minutesPerQuest: m })">{{ m }}</button>
                    }
                  </div>
                }
              </div>
            }

            <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left" (click)="toggle('quests')">
              <span class="flex-1 font-semibold text-[14.5px]">Daily quests</span>
              <span class="text-[13px] text-mute font-semibold">{{ quests() ? quests()!.length + ' active' : '' }}</span>
              <span class="text-mute inline-flex transition-transform" [class.rotate-90]="open() === 'quests'"><app-icon name="chev" [size]="16" /></span>
            </button>
            @if (open() === 'quests') {
              <div class="px-3.5 py-1.5 bg-[rgba(0,0,0,.12)]">
                <div class="flex items-center justify-end gap-1.5 pt-1.5 text-[11.5px] text-mute"><app-icon name="users" [size]="13" />Friends check: 3 people verify the photo@if (!u.pro) { <app-pro-tag /> }</div>
                @if (questsFailed()) {
                  <div class="py-4 text-center">
                    <div class="font-bold text-[14px]">Couldn't load quests</div>
                    <button class="btn btn-ghost btn-sm mx-auto mt-3" (click)="loadQuests()"><app-icon name="refresh" />Retry</button>
                  </div>
                } @else {
                  @for (q of pathCatalog(); track q.code) {
                    <div class="flex items-center gap-3 h-[50px]">
                      <button class="flex-1 min-w-0 flex items-center gap-3 h-full text-left" [disabled]="busy()" (click)="toggleQuest(q.code, q.free)">
                        <span class="qi !w-[32px] !h-[32px] !rounded-[10px] bg-s2 text-mute"><app-icon [name]="q.icon" [size]="16" /></span>
                        <span class="flex-1 min-w-0">
                          <span class="font-semibold text-[14px] flex items-center gap-1.5 truncate">{{ q.name }}@if (!q.free && !u.pro) { <app-pro-tag /> }</span>
                          @if (activeByCode().get(q.code); as uq) {
                            @if (scheduleText(uq); as st) { <span class="block text-[11.5px] text-mute truncate">{{ st }}</span> }
                          }
                        </span>
                        <span class="tog" [class.on]="activeCodes().has(q.code)" [class.disabled]="!q.free && !u.pro"></span>
                      </button>
                      @if (activeByCode().get(q.code); as uq) {
                        <ng-container *ngTemplateOutlet="scheduleBtn; context: { $implicit: uq }" />
                        <ng-container *ngTemplateOutlet="squadBtn; context: { $implicit: uq }" />
                      } @else {
                        <span class="w-[72px] flex-none" aria-hidden="true"></span>
                      }
                    </div>
                    @if (activeByCode().get(q.code); as uq) {
                      @if (scheduling() === uq.id) { <ng-container *ngTemplateOutlet="schedulePanel; context: { $implicit: uq }" /> }
                    }
                  } @empty {
                    <div class="skeleton h-[150px] my-1.5"></div>
                  }
                }
                @for (q of customQuests(); track q.id) {
                  <div class="flex items-center gap-3 h-[50px]">
                    <span class="qi !w-[32px] !h-[32px] !rounded-[10px] bg-[rgba(var(--accent-rgb),.14)] text-accent"><app-icon [name]="q.icon" [size]="16" /></span>
                    <span class="flex-1 min-w-0">
                      <span class="block font-semibold text-[14px] truncate">{{ q.name }} <span class="tag tag-accent ml-1">Custom</span></span>
                      @if (scheduleText(q); as st) { <span class="block text-[11.5px] text-mute truncate">{{ st }}</span> }
                    </span>
                    <ng-container *ngTemplateOutlet="scheduleBtn; context: { $implicit: q }" />
                    <ng-container *ngTemplateOutlet="squadBtn; context: { $implicit: q }" />
                    <button class="circ !w-8 !h-8 text-mute" [disabled]="busy()" (click)="deleteQuest(q)" aria-label="Delete quest"><app-icon name="trash" [size]="15" /></button>
                  </div>
                  @if (scheduling() === q.id) { <ng-container *ngTemplateOutlet="schedulePanel; context: { $implicit: q }" /> }
                }
                <ng-template #scheduleBtn let-uq>
                  <button class="circ !w-8 !h-8" [class.text-mute]="scheduling() !== uq.id" [class.text-accent]="scheduling() === uq.id"
                    [style.border-color]="scheduling() === uq.id ? 'rgba(var(--accent-rgb),.55)' : null"
                    (click)="toggleSchedule(uq)" [attr.aria-expanded]="scheduling() === uq.id" [attr.aria-label]="'Schedule ' + uq.name">
                    <app-icon name="cal" [size]="15" />
                  </button>
                </ng-template>
                <ng-template #schedulePanel let-uq>
                  <div class="pb-3 pt-0.5">
                    <app-quest-schedule [days]="uq.days" [perDay]="uq.multiSlot ? uq.perDay : null" [disabled]="busy()"
                      [goal]="goal(uq)" [goalKind]="kind(uq)"
                      (daysChange)="saveSchedule(uq, { days: $event })" (perDayChange)="saveSchedule(uq, { perDay: $event })" (goalChange)="saveSchedule(uq, { target: $event })" />
                  </div>
                </ng-template>
                <ng-template #squadBtn let-uq>
                  @if (uq.proof === 'PHOTO') {
                    <button class="circ !w-8 !h-8" [class.text-mute]="!uq.squadCheck" [class.text-accent]="uq.squadCheck"
                      [style.background]="uq.squadCheck ? 'rgba(var(--accent-rgb),.16)' : null" [style.border-color]="uq.squadCheck ? 'rgba(var(--accent-rgb),.55)' : null"
                      [disabled]="busy()" (click)="toggleSquad(uq)" [attr.aria-pressed]="uq.squadCheck" [attr.aria-label]="'Friends check ' + uq.name">
                      <app-icon name="users" [size]="15" />
                    </button>
                  } @else {
                    <span class="w-8 flex-none" aria-hidden="true"></span>
                  }
                </ng-template>
                <a class="flex items-center gap-3 h-[50px]" [routerLink]="u.pro ? '/stats/custom-quest' : '/paywall'">
                  <span class="qi !w-[32px] !h-[32px] !rounded-[10px] border border-dashed border-line text-mute"><app-icon name="plus" [size]="16" /></span>
                  <span class="flex-1 font-semibold text-[14px] text-mute flex items-center gap-1.5">Custom quest<app-pro-tag /></span>
                </a>
              </div>
            }

            <div class="flex items-center gap-3 px-3.5 h-[56px]">
              <span class="flex-1"><span class="block font-semibold text-[14.5px] leading-tight">App blocker</span><span class="block text-[12px] text-mute">Accessibility service that locks apps</span></span>
              @if (!lock.native) {
                <span class="text-[12.5px] text-mute font-semibold">Android only</span>
              } @else if (lock.blocked()) {
                <span class="tag tag-pro">Blocked</span>
              } @else if (lock.status()?.serviceEnabled) {
                <button class="tag tag-free" (click)="manageLock()">On</button>
              } @else {
                <button class="qbtn" (click)="enableLock()">Enable</button>
              }
            </div>
            @if (lock.blocked()) {
              <div class="px-3.5 pb-3"><app-ap-warning /></div>
            }

            <div class="flex items-center gap-3 px-3.5 h-[56px]">
              <span class="flex-1"><span class="block font-semibold text-[14.5px] leading-tight">Health Connect</span><span class="block text-[12px] text-mute">Steps &amp; sleep for auto quests</span></span>
              @if (!health.native) {
                <span class="text-[12.5px] text-mute font-semibold">Android only</span>
              } @else if (health.authorized()) {
                <button class="tag tag-free" (click)="health.openSettings()">Connected</button>
              } @else {
                <button class="qbtn" [disabled]="busy()" (click)="connectHealth()">Connect</button>
              }
            </div>

            <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left" (click)="toggleSlipUps()">
              <span class="flex-1 font-semibold text-[14.5px] flex items-center gap-1.5">Slip-up tracking@if (!u.pro) { <app-pro-tag /> }</span>
              <span class="tog" [class.on]="u.pro && u.slipUpTracking" [class.disabled]="!u.pro"></span>
            </button>

            <button class="w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[56px] text-left" role="switch" [attr.aria-checked]="!!u.skipRestDays" [disabled]="busy()" (click)="toggleRestDays()">
              <span class="flex-1 min-w-0">
                <span class="block font-semibold text-[14.5px] leading-tight">Skip days with nothing scheduled</span>
                <span class="block text-[12px] text-mute leading-snug mt-0.5">When on, days without quests don't break your streak.</span>
              </span>
              <span class="tog" [class.on]="!!u.skipRestDays"></span>
            </button>
          </div>
        </div>

        <div class="pad mt-4">
          <div class="lbl mb-2">Notifications</div>
          <div class="card divide-y divide-line">
            <div class="flex items-center gap-3 px-3.5 h-[56px]">
              <span class="flex-1"><span class="block font-semibold text-[14.5px] leading-tight">Notifications</span><span class="block text-[12px] text-mute">Reminders, friends &amp; your plan</span></span>
              @switch (notificationState()) {
                @case ('web') { <span class="text-[12.5px] text-mute font-semibold">Android only</span> }
                @case ('on') { <span class="tag tag-free">On</span> }
                @default { <button class="qbtn" (click)="enableNotifications()">Turn on</button> }
              }
            </div>
            @if (notificationState() !== 'web') {
              <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left" (click)="openNotificationSettings()">
                <span class="flex-1 font-semibold text-[14.5px]">Notification settings</span>
                <span class="text-mute inline-flex"><app-icon name="chev" [size]="16" /></span>
              </button>
            }
            <ng-container *ngTemplateOutlet="switchRow; context: { key: 'verifyRequestPushes', on: u.verifyRequestPushes !== false, title: 'Verify requests', text: 'A push when friends need your verify, at most one every 3 hours' }" />
          </div>
        </div>

        <div class="pad mt-4">
          <div class="lbl mb-2">Privacy</div>
          <div class="card divide-y divide-line">
            <button class="w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[56px] text-left" role="switch" [attr.aria-checked]="u.pro && u.publicByDefault" [disabled]="busy()" (click)="togglePublic()">
              <span class="flex-1 min-w-0">
                <span class="font-semibold text-[14.5px] flex items-center gap-1.5">Public milestone rewards<app-pro-tag /></span>
                <span class="block text-[12px] text-mute leading-snug mt-0.5">New milestones are shared with everyone. Friends-check quests have their own choice.</span>
              </span>
              <span class="tog" [class.on]="u.pro && u.publicByDefault" [class.disabled]="!u.pro"></span>
            </button>
            <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left" (click)="u.pro ? toggle('verify') : paywall()">
              <span class="flex-1 font-semibold text-[14.5px] flex items-center gap-1.5">Verification<app-pro-tag /></span>
              <span class="text-[13px] text-mute font-semibold">{{ u.pro && u.defaultVerification === 'COMMUNITY' ? 'Community' : 'AI' }}</span>
              <span class="text-mute inline-flex transition-transform" [class.rotate-90]="open() === 'verify'"><app-icon name="chev" [size]="16" /></span>
            </button>
            @if (open() === 'verify') {
              <div class="px-3.5 py-2 bg-[rgba(0,0,0,.12)] space-y-1">
                <button class="w-full flex items-center gap-3 py-2 text-left" (click)="setVerification('AI')">
                  <span class="radio" [class.on]="u.defaultVerification === 'AI'"></span>
                  <span class="flex-1"><span class="block font-semibold text-[14px]">AI check</span><span class="block text-[12px] text-mute">Checks your proof photo automatically. Nobody else sees the photo.</span></span>
                </button>
                <button class="w-full flex items-center gap-3 py-2 text-left" (click)="setVerification('COMMUNITY')">
                  <span class="radio" [class.on]="u.defaultVerification === 'COMMUNITY'"></span>
                  <span class="flex-1"><span class="block font-semibold text-[14px]">Community</span><span class="block text-[12px] text-mute">3 people verify it: your friends, or anyone when the milestone is public. Your scale photo is shown to them.</span></span>
                </button>
              </div>
            }
            <ng-container *ngTemplateOutlet="switchRow; context: { key: 'hiddenFromSearch', on: !!u.hiddenFromSearch, title: 'Hide me from search', text: 'Nobody finds you by @handle or name. Your invite link still works.' }" />
            <ng-container *ngTemplateOutlet="switchRow; context: { key: 'hiddenFromLeaderboards', on: !!u.hiddenFromLeaderboards, title: 'Hide me from leaderboards', text: 'You are left out of your friends’ boards. You still see your own place.' }" />
            @if (eu()) {
              <ng-container *ngTemplateOutlet="switchRow; context: { key: 'shareStats', on: !!u.shareStats, title: 'Help improve DropZone', text: 'Share anonymised insights with us and our partners to improve the service. Your personal data stays private.' }" />
            }
            <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left" (click)="toggleBlocked()">
              <span class="flex-1 font-semibold text-[14.5px]">Blocked users</span>
              @if (blocked(); as list) { <span class="text-[13px] text-mute font-semibold">{{ list.length }}</span> }
              <span class="text-mute inline-flex transition-transform" [class.rotate-90]="open() === 'blocked'"><app-icon name="chev" [size]="16" /></span>
            </button>
            @if (open() === 'blocked') {
              <div class="px-3.5 py-2 bg-[rgba(0,0,0,.12)] space-y-1">
                @for (b of blocked() ?? []; track b.id) {
                  <div class="flex items-center gap-3 py-1.5">
                    <span class="flex-1 min-w-0"><span class="block font-semibold text-[14px] truncate">{{ b.displayName }}</span><span class="block text-[12px] text-mute">&#64;{{ b.handle }}</span></span>
                    <button class="btn btn-ghost btn-sm !w-auto !px-3" (click)="unblock(b.id)">Unblock</button>
                  </div>
                } @empty {
                  <p class="text-[12.5px] text-mute py-2">{{ blocked() ? 'No blocked users.' : 'Loading…' }}</p>
                }
              </div>
            }
          </div>
        </div>

        <div class="pad mt-4">
          <div class="lbl mb-2">Account</div>
          <div class="card divide-y divide-line">
            <div class="flex items-center gap-3 px-3.5 h-[50px]">
              <span class="flex-1 font-semibold text-[14.5px] truncate">{{ u.email }}</span>
            </div>
            @if (u.admin) {
              <a class="w-full flex items-center gap-3 px-3.5 h-[50px]" routerLink="/admin/reports">
                <app-icon name="flag" [size]="18" /><span class="flex-1 font-semibold text-[14.5px]">Review reports</span><app-icon name="chev" [size]="16" />
              </a>
            }
            @if (legal()?.termsUrl; as url) {
              <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left" (click)="openLink(url)">
                <span class="flex-1 font-semibold text-[14.5px]">Terms of Service</span><span class="text-mute inline-flex"><app-icon name="chev" [size]="16" /></span>
              </button>
            }
            @if (legal()?.privacyUrl; as url) {
              <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left" (click)="openLink(url)">
                <span class="flex-1 font-semibold text-[14.5px]">Privacy Policy</span><span class="text-mute inline-flex"><app-icon name="chev" [size]="16" /></span>
              </button>
            }
            <button class="w-full flex items-center gap-3 px-3.5 h-[56px] text-left" [disabled]="exporting()" (click)="exportData()">
              <app-icon name="download" [size]="18" />
              <span class="flex-1 min-w-0">
                <span class="block font-semibold text-[14.5px] leading-tight">{{ exporting() ? 'Preparing your data…' : 'Download my data' }}</span>
                <span class="block text-[12px] text-mute truncate">A JSON file with your profile, goals, logs and posts</span>
              </span>
            </button>
            <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left text-accent font-bold text-[14.5px]" (click)="logout()">
              <app-icon name="logout" [size]="18" /><span class="flex-1">Log out</span>
            </button>
            <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left font-semibold text-[14.5px]" [disabled]="busy()" (click)="signOutEverywhere()">
              <app-icon name="logout" [size]="18" /><span class="flex-1">Sign out everywhere</span>
            </button>
            <button class="w-full flex items-center gap-3 px-3.5 h-[50px] text-left font-semibold text-[14.5px] text-mute" [disabled]="busy()" (click)="openDelete()">
              <app-icon name="trash" [size]="18" /><span class="flex-1">Delete account</span>
            </button>
          </div>
        </div>
      }
    </div>

    @if (deleting()) {
      <app-delete-account-sheet (closed)="deleting.set(false)" />
    }

    <ng-template #switchRow let-key="key" let-on="on" let-title="title" let-text="text">
      <button class="w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[56px] text-left" role="switch" [attr.aria-checked]="on" [disabled]="busy()" (click)="toggleFlag(key)">
        <span class="flex-1 min-w-0">
          <span class="block font-semibold text-[14.5px] leading-tight">{{ title }}</span>
          <span class="block text-[12px] text-mute leading-snug mt-0.5">{{ text }}</span>
        </span>
        <span class="tog" [class.on]="on"></span>
      </button>
    </ng-template>
  `
})
export class SettingsPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);
  private readonly billing = inject(BillingService);
  private readonly catalog = inject(CatalogStore);
  private readonly todayStore = inject(TodayStore);
  private readonly toast = inject(ToastService);
  private readonly prompt = inject(PromptService);
  protected readonly avatar = inject(AvatarService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly theme = inject(ThemeService);
  protected readonly lock = inject(LockService);
  protected readonly health = inject(HealthService);
  private readonly configs = inject(ConfigService);
  private readonly push = inject(PushService);
  private readonly dataExport = inject(DataExportService);
  private readonly region = inject(RegionService);
  protected readonly eu = this.region.eu;
  private readonly audience = inject(AudienceService);
  private readonly goals = inject(GoalStore);
  private resumeHandle: PluginListenerHandle | null = null;

  protected readonly user = this.session.user;
  protected readonly apps = LOCKABLE_APPS;
  protected readonly minuteOptions = [15, 30, 45, 60];
  protected readonly themes: { id: Theme; name: string; sub: string }[] = [
    { id: 'NEON', name: 'Neon', sub: 'Default' },
    { id: 'STEALTH', name: 'Stealth', sub: 'Dark & minimal' }
  ];
  protected readonly open = signal<Section | null>(null);
  protected readonly blocked = signal<UserSummary[] | null>(null);
  protected readonly busy = signal(false);
  protected readonly profileForm = viewChild(ProfileForm);
  protected readonly profileName = signal(this.session.user()?.displayName ?? '');
  protected readonly profileHandle = signal(cleanHandle(this.session.user()?.handle ?? ''));
  protected readonly profileBio = signal(this.session.user()?.bio ?? '');
  protected readonly profileDirty = computed(() => {
    const u = this.user();
    return !!u && (this.profileName().trim() !== u.displayName || this.profileHandle() !== u.handle || this.profileBio().trim() !== (u.bio ?? ''));
  });
  protected readonly quests = signal<UserQuest[] | null>(null);
  protected readonly questsFailed = signal(false);
  protected readonly legal = this.configs.config;
  protected readonly deleting = signal(false);
  protected readonly exporting = signal(false);
  protected readonly scheduling = signal<string | null>(null);

  protected readonly pathCatalog = computed(() => this.catalog.catalog().filter(q => q.path === this.session.path()));
  protected readonly customQuests = computed(() => (this.quests() ?? []).filter(q => q.custom));
  protected readonly activeByCode = computed(() => new Map((this.quests() ?? []).filter(q => !q.custom && q.code).map(q => [q.code as string, q])));
  protected readonly activeCodes = computed(() => new Set((this.quests() ?? []).filter(q => !q.custom && q.code).map(q => q.code as string)));
  protected readonly planTitle = computed(() => {
    const u = this.user();
    if (!u?.pro) return 'Free plan';
    if (u.trial) return 'PRO trial';
    const name = planLabel(u.proProductId);
    return name ? `DropZone PRO · ${name}` : 'DropZone PRO';
  });
  protected readonly planSub = computed(() => {
    const u = this.user();
    if (!u?.pro) return '3 basic quests · Instagram lock';
    if (u.trial && u.trialEndsAt) return `Ends ${trialEnd(u.trialEndsAt, false)} · ${trialLeft(u.trialEndsAt) ?? 'ending'}`;
    if (!u.proExpiresAt) return 'Active';
    const date = new Date(u.proExpiresAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return u.willRenew ? `Renews ${date}` : `Ends ${date} · Resubscribe`;
  });
  protected readonly notificationState = computed(() => {
    const p = this.push.permission();
    return p === 'granted' ? 'on' : p === 'unavailable' ? 'web' : 'off';
  });

  constructor() {
    this.loadQuests();
    if (!this.legal()) void this.configs.load();
    void this.push.checkPermission();
    if (this.lock.native) {
      void this.lock.refreshStatus().catch(() => undefined);
      void CapApp.addListener('resume', () => {
        void this.lock.refreshStatus().catch(() => undefined);
        void this.push.checkPermission();
      }).then(h => (this.resumeHandle = h));
    }
    inject(DestroyRef).onDestroy(() => void this.resumeHandle?.remove());
  }

  protected loadQuests(): void {
    this.questsFailed.set(false);
    if (!this.quests()) void this.api.quests().then(q => this.quests.set(q)).catch(() => this.questsFailed.set(true));
    void this.catalog.load().catch(() => this.questsFailed.set(true));
  }

  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/me');
  }

  protected async toggleBlocked(): Promise<void> {
    this.toggle('blocked');
    if (this.open() !== 'blocked') return;
    try {
      this.blocked.set(await this.api.blocked());
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected async unblock(userId: string): Promise<void> {
    const name = (this.blocked() ?? []).find(b => b.id === userId)?.displayName ?? 'this person';
    const ok = await this.prompt.confirm(`Unblock ${name}?`, 'You will be able to see each other’s posts and comments again. Your friendship is not restored.', 'Unblock', 'Cancel');
    if (!ok) return;
    try {
      await this.api.unblock(userId);
      this.blocked.update(list => (list ?? []).filter(b => b.id !== userId));
      this.toast.show('Unblocked.');
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected toggle(s: Section): void {
    this.open.update(o => (o === s ? null : s));
  }

  protected paywall(): void {
    void this.router.navigateByUrl('/paywall');
  }

  protected async setTheme(t: Theme): Promise<void> {
    const prev = this.theme.theme();
    if (prev === t) return;
    this.theme.set(t);
    try {
      await this.session.update({ theme: t });
    } catch (e) {
      this.theme.set(prev);
      this.toast.error(e);
    }
  }

  protected async saveProfile(): Promise<void> {
    this.busy.set(true);
    try {
      const u = await this.session.update({ displayName: this.profileName().trim(), handle: this.profileHandle(), bio: this.profileBio().trim() });
      this.profileName.set(u.displayName);
      this.profileHandle.set(u.handle);
      this.profileBio.set(u.bio ?? '');
      this.toast.show('Profile saved.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async setUnits(patch: { weightUnit?: WeightUnit; lengthUnit?: LengthUnit }): Promise<void> {
    const u = this.user();
    if (!u || (patch.weightUnit ?? u.weightUnit) === u.weightUnit && (patch.lengthUnit ?? u.lengthUnit) === u.lengthUnit) return;
    this.busy.set(true);
    try {
      await this.session.update(patch);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected plan(): void {
    const u = this.user();
    if (!u?.pro || u.trial) {
      this.paywall();
      return;
    }
    openExternal(playSubscriptionsUrl(u.proProductId));
  }

  protected fixPayment(): void {
    openExternal(playSubscriptionsUrl(this.user()?.proProductId));
  }

  protected async restore(): Promise<void> {
    this.busy.set(true);
    try {
      this.toast.show((await this.billing.restore()) ? 'PRO restored.' : 'No subscription found on this Google Play account.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async patch(p: UserPatch): Promise<boolean> {
    try {
      await this.session.update(p);
      return true;
    } catch (e) {
      if (isProRequired(e)) this.paywall();
      else this.toast.error(e);
      return false;
    }
  }

  protected setUnlock(mode: UnlockMode): void {
    if (mode === 'MINUTES' && !this.user()?.pro) {
      this.paywall();
      return;
    }
    if (this.user()?.unlockMode !== mode) void this.patch({ unlockMode: mode }).then(() => this.syncLock());
  }

  protected async setVerification(v: Verification): Promise<void> {
    if (this.user()?.defaultVerification === v) return;
    if (await this.patch({ defaultVerification: v })) await this.offerApplyDefaults();
  }

  protected toggleSlipUps(): void {
    const u = this.user();
    if (!u?.pro) {
      this.paywall();
      return;
    }
    void this.patch({ slipUpTracking: !u.slipUpTracking });
  }

  protected async toggleRestDays(): Promise<void> {
    const u = this.user();
    if (!u || this.busy()) return;
    this.busy.set(true);
    try {
      await this.session.update({ skipRestDays: !u.skipRestDays });
      void this.todayStore.load().catch(() => undefined);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleFlag(key: Flag): Promise<void> {
    const u = this.user();
    if (!u || this.busy()) return;
    const on = key === 'verifyRequestPushes' ? u.verifyRequestPushes !== false : !!u[key];
    this.busy.set(true);
    try {
      await this.session.update(key === 'shareStats' ? { shareStats: !on, region: this.region.region() } : { [key]: !on });
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async togglePublic(): Promise<void> {
    const u = this.user();
    if (!u?.pro) {
      this.paywall();
      return;
    }
    if (await this.patch({ publicByDefault: !u.publicByDefault })) await this.offerApplyDefaults();
  }

  private async offerApplyDefaults(): Promise<void> {
    const goal = this.goals.goal() ?? await this.goals.load();
    const n = goal?.checkpoints.filter(c => c.status === 'ACTIVE' || c.status === 'LOCKED').length ?? 0;
    if (!n) return;
    const one = n === 1;
    const ok = await this.prompt.confirm(`Apply to your ${n} remaining milestone${one ? '' : 's'}?`,
      `${one ? 'The milestone' : 'Milestones'} you haven't reached yet get${one ? 's' : ''} the new privacy and verification settings. Milestones you already reached or sent a proof for stay as they are.`,
      'Apply', 'Not now');
    if (!ok) return;
    this.busy.set(true);
    try {
      const { count } = await this.api.applyGoalDefaults();
      void this.goals.load();
      this.toast.show(count ? `Updated ${count} milestone${count === 1 ? '' : 's'}.` : 'Your milestones already use these settings.');
    } catch (e) {
      if (isProRequired(e)) this.paywall();
      else this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleApp(a: LockableApp): Promise<void> {
    const u = this.user();
    if (!u) return;
    if (!a.free && !u.pro) {
      this.paywall();
      return;
    }
    const on = u.lockedApps.includes(a.pkg);
    const packages = on ? u.lockedApps.filter(p => p !== a.pkg) : [...u.lockedApps, a.pkg];
    try {
      const updated = await this.api.setLockedApps(packages);
      this.session.setUser(updated);
      await this.syncLock(updated);
    } catch (e) {
      if (isProRequired(e)) this.paywall();
      else this.toast.error(e);
    }
  }

  protected async toggleQuest(code: string, free: boolean): Promise<void> {
    if (!free && !this.user()?.pro) {
      this.paywall();
      return;
    }
    const codes = new Set(this.activeCodes());
    if (codes.has(code)) {
      const name = this.pathCatalog().find(q => q.code === code)?.name ?? 'this quest';
      const ok = await this.prompt.confirm(`Remove ${name}?`, 'It will no longer be part of your daily quests. You can add it back anytime.', 'Remove', 'Cancel');
      if (!ok) return;
      codes.delete(code);
    } else {
      codes.add(code);
    }
    if (codes.size === 0 && this.customQuests().length === 0) {
      this.toast.show('Keep at least one daily quest.');
      return;
    }
    this.busy.set(true);
    try {
      this.quests.set(await this.api.setQuests([...codes]));
      void this.todayStore.load().catch(() => undefined);
    } catch (e) {
      if (isProRequired(e)) this.paywall();
      else this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected scheduleText(q: UserQuest): string | null {
    const meals = q.multiSlot && q.perDay > 1 ? `${q.perDay} meals a day` : null;
    const kind = goalKindOf(q);
    const value = goalOf(q);
    const goal = kind && value ? goalText(kind, value) : null;
    const days = q.days.length < 7 ? daysLabel(q.days) : null;
    const check = q.squadCheck && this.user()?.pro ? audienceLabel(q.checkAudience) : null;
    return [goal, meals, days, check].filter(Boolean).join(' · ') || null;
  }

  protected kind(q: UserQuest): GoalKind | null {
    return goalKindOf(q);
  }

  protected goal(q: UserQuest): number | null {
    return goalOf(q);
  }

  protected toggleSchedule(q: UserQuest): void {
    this.scheduling.update(id => (id === q.id ? null : q.id));
  }

  protected async saveSchedule(q: UserQuest, patch: QuestPatch): Promise<void> {
    this.busy.set(true);
    try {
      const updated = await this.api.updateQuest(q.id, patch);
      this.quests.update(list => (list ?? []).map(x => (x.id === updated.id ? updated : x)));
      void this.todayStore.load().catch(() => undefined);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleSquad(q: UserQuest): Promise<void> {
    if (!this.user()?.pro) {
      this.paywall();
      return;
    }
    const pick = await this.audience.choose('quest', q.squadCheck ? q.checkAudience ?? 'FRIENDS' : null, q.squadCheck);
    if (!pick) return;
    const patch: QuestPatch = pick === 'OFF' ? { squadCheck: false } : { squadCheck: true, checkAudience: pick };
    if (pick !== 'OFF' && q.squadCheck && pick === (q.checkAudience ?? 'FRIENDS')) return;
    await this.saveSquad(q, patch);
  }

  private async saveSquad(q: UserQuest, patch: QuestPatch): Promise<void> {
    this.busy.set(true);
    try {
      const updated = await this.api.updateQuest(q.id, patch);
      this.quests.update(list => (list ?? []).map(x => (x.id === updated.id ? updated : x)));
      this.toast.show(!updated.squadCheck ? `${updated.name}: Friends check off` : updated.checkAudience === 'EVERYONE' ? `${updated.name}: everyone can verify it` : `${updated.name}: friends verify it`);
    } catch (e) {
      if (isProRequired(e)) this.paywall();
      else if (isNeedFriends(e)) {
        this.busy.set(false);
        const instead = await this.audience.needFriends();
        if (instead) await this.saveSquad(q, { squadCheck: true, checkAudience: instead });
      } else this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async deleteQuest(q: UserQuest): Promise<void> {
    const ok = await this.prompt.confirm(`Delete "${q.name}"?`, 'This custom quest will be deleted. Your past logs stay in your history.', 'Delete', 'Cancel');
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.api.deleteQuest(q.id);
      this.quests.update(list => (list ?? []).filter(x => x.id !== q.id));
      void this.todayStore.load().catch(() => undefined);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async manageLock(): Promise<void> {
    try {
      await this.lock.manage();
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected async enableLock(): Promise<void> {
    try {
      await this.lock.openSettings();
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected async connectHealth(): Promise<void> {
    this.busy.set(true);
    try {
      const access = await this.health.authorize();
      if (access === 'unavailable') {
        const install = await this.prompt.confirm('Install Health Connect', 'Steps and sleep quests sync from Health Connect. Install it from Google Play first.', 'Open Google Play', 'Not now');
        if (install) this.health.openInstall();
      } else if (access !== 'not-now') {
        this.toast.show(access === 'granted' ? 'Health Connect linked.' : 'Allow steps or sleep access in Health Connect.');
      }
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async enableNotifications(): Promise<void> {
    const state = this.push.permission() === 'denied' ? 'denied' : await this.push.enable();
    if (state === 'granted') this.toast.show('Notifications are on.');
    else if (state === 'denied') {
      const open = await this.prompt.confirm('Notifications are off', 'Android blocks DropZone notifications. Open the notification settings and turn them on.', 'Open settings', 'Close');
      if (open) await this.openNotificationSettings();
    }
  }

  protected async openNotificationSettings(): Promise<void> {
    try {
      await this.push.openSettings();
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.signOut();
  }

  protected openLink(url: string): void {
    openExternal(url);
  }

  protected async signOutEverywhere(): Promise<void> {
    const ok = await this.prompt.confirm('Sign out everywhere?', 'You will be signed out on all your devices, including this one.', 'Sign out', 'Cancel');
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.api.signOutEverywhere();
      await this.auth.signOut({ revoked: true });
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected openDelete(): void {
    this.deleting.set(true);
  }

  protected async exportData(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      if ((await this.dataExport.download()) === 'saved') this.toast.show('Your data was downloaded.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.exporting.set(false);
    }
  }

  private async syncLock(user: User | null = this.user()): Promise<void> {
    if (this.lock.native) await this.lock.sync(user, this.todayStore.today()).catch(() => undefined);
  }
}
