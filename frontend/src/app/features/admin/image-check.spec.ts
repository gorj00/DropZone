import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ReportEntry, ReportedItem, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { ReportEntries } from './report-detail';
import { ReportsPage, reasonLabel } from './reports';

const mia = { id: 'u2', displayName: 'Mia', handle: 'mia', avatarUrl: null, path: 'LOSE' as const };
const now = new Date().toISOString();

function setup(api: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ApiService, useValue: api },
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'admin', admin: true, pro: true, onboarded: true, theme: 'NEON', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lockedApps: [] } as unknown as User);
}

describe('Image check reports', () => {
  it('labels image-check reasons and keeps the others', () => {
    expect(reasonLabel('Image check: adult LIKELY, racy POSSIBLE')).toBe('Flagged by the image check');
    expect(reasonLabel('Nudity')).toBe('Nudity');
  });

  it('shows a report without a reporter as flagged by the image check', async () => {
    setup();
    const entries: ReportEntry[] = [
      { targetType: 'POST', targetId: 'f1', reporter: null, reason: 'Image check: adult LIKELY, racy POSSIBLE', createdAt: now },
      { targetType: 'POST', targetId: 'f1', reporter: mia, reason: 'Nudity', createdAt: now }
    ];
    const fixture = TestBed.createComponent(ReportEntries);
    fixture.componentRef.setInput('entries', entries);
    fixture.detectChanges();
    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')].map(a => a.textContent?.replace(/\s+/g, ' ').trim() ?? '');
    expect(rows[0]).toContain('Flagged by the image check');
    expect(rows[0]).toContain('adult LIKELY, racy POSSIBLE');
    expect(rows[0]).not.toContain('Deleted account');
    expect(rows[1]).toContain('Mia');
  });

  it('shows the image check in the queue', async () => {
    const item: ReportedItem = {
      targetType: 'POST', targetId: 'f1', reportCount: 1, hidden: true, reasons: ['Image check: adult VERY_LIKELY, racy LIKELY'], lastReportedAt: now,
      author: mia, preview: 'Day 4', photoUrl: null, feedItemId: 'f1'
    };
    setup({ reportedItems: vi.fn().mockResolvedValue([item]) });
    const fixture = TestBed.createComponent(ReportsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const chips = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.chip')].map(c => c.textContent?.trim());
    expect(chips).toContain('Flagged by the image check');
  });
});
