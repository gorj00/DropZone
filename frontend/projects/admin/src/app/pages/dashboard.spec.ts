import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../core/api';
import type { Overview } from '../core/models';
import { DashboardPage } from './dashboard';

const overview: Overview = {
  totals: { users: 12, onboarded: 9, subscribed: 2, trial: 3, suspended: 1, newLast7Days: 4, activeLast7Days: 6 },
  signups: Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, count: i === 29 ? 3 : 0 })),
  jobs: [
    { name: 'daily-reminders', lastRunAt: '2026-11-01T10:00:00Z', failedAt: null, error: null },
    { name: 'upload-sweep', lastRunAt: '2026-11-01T03:30:00Z', failedAt: '2026-11-01T03:30:00Z', error: 'IllegalStateException: disk' },
    { name: 'billing-reconcile', lastRunAt: null, failedAt: null, error: null }
  ],
  failedJobs: 1,
  health: {
    errorsLast5Minutes: 0, busyLast5Minutes: 0, databaseWaitsLast5Minutes: 0, inFlight: 1, poolActive: 1, poolIdle: 3, poolWaiting: 0, poolMax: 4,
    heapUsedMb: 120, heapMaxMb: 512, startedAt: '2026-11-01T08:00:00Z', version: '0.0.1', commit: 'abc1234', revision: 'dropzone-api-00012-x'
  },
  openReports: 2,
  errorsLast24Hours: 0,
  billingEvents: [{ id: 'e1', type: 'RENEWAL', appUserId: 'u1', email: 'a@b.c', environment: 'PRODUCTION', receivedAt: '2026-11-01T09:00:00Z' }]
};

describe('DashboardPage', () => {
  it('shows totals and flags failed jobs', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }]), { provide: ApiService, useValue: { overview: vi.fn().mockResolvedValue(overview) } }]
    });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent?.replace(/\s+/g, '') ?? '';
    expect(text).toContain('Users12');
    expect(text).toContain('2itemstoreview');
    const tags = [...el.querySelectorAll('.tag')].map(t => t.textContent?.trim() ?? '');
    expect(tags.some(t => t.startsWith('Failed'))).toBe(true);
    expect(tags).toContain('Never ran');
    expect(tags).toContain('RENEWAL');
    expect(el.querySelectorAll('.bars > i').length).toBe(30);
  });
});
