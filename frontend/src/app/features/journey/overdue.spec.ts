import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Checkpoint, Goal } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { ProofService } from '../../core/proof.service';
import { CheckpointPage } from './checkpoint';
import { JourneyPage } from './journey';

const cp = (patch: Partial<Checkpoint>): Checkpoint => ({
  id: 'cp1', index: 1, targetValue: 68, deltaToEarn: 2, rewardTitle: 'New shoes', rewardImageUrl: null, isPublic: false, verification: 'AI',
  deadline: '2026-10-20', status: 'ACTIVE', clearedAt: null, proofId: null, verifiedCount: 0, requiredVerifications: 0, ...patch
});

const goal = (checkpoints: Checkpoint[]): Goal => ({
  id: 'g1', path: 'LOSE', metric: 'WEIGHT', metricLabel: null, unit: 'kg', startValue: 70, goalValue: 64, currentValue: 69, progressValue: 1, totalValue: 6, checkpoints
});

function setup(g: Goal) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: { goal: vi.fn().mockResolvedValue(g), measurements: vi.fn().mockResolvedValue([]), friends: vi.fn().mockResolvedValue([]), checkpointSocial: vi.fn().mockResolvedValue(null) } },
      { provide: ProofService, useValue: {} },
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
}

describe('Overdue milestones', () => {
  beforeAll(() => {
    if (!('ResizeObserver' in globalThis)) {
      Object.assign(globalThis, { ResizeObserver: class { observe() { } disconnect() { } } });
    }
  });

  it('tags an overdue milestone on its screen', async () => {
    setup(goal([cp({ overdue: true }), cp({ id: 'cp2', index: 2, status: 'LOCKED', deadline: null })]));
    const fixture = TestBed.createComponent(CheckpointPage);
    fixture.componentRef.setInput('id', 'cp1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-test=overdue]')?.textContent?.trim()).toBe('Overdue');
    expect(el.textContent).toContain('overdue');
  });

  it('shows no tag while the deadline is ahead', async () => {
    setup(goal([cp({ overdue: false, deadline: '2026-12-01' }), cp({ id: 'cp2', index: 2, status: 'LOCKED', deadline: null })]));
    const fixture = TestBed.createComponent(CheckpointPage);
    fixture.componentRef.setInput('id', 'cp1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-test=overdue]')).toBeNull();
    expect(el.textContent).toContain('deadline');
  });

  it('tags only the overdue milestones on the journey map', async () => {
    setup(goal([cp({ overdue: true }), cp({ id: 'cp2', index: 2, status: 'LOCKED', deadline: '2026-12-01', overdue: false }), cp({ id: 'cp3', index: 3, status: 'LOCKED', deadline: null })]));
    const fixture = TestBed.createComponent(JourneyPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const tags = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-test=overdue]')];
    expect(tags.length).toBe(1);
    expect(tags[0].closest('a')?.textContent).toContain('Milestone 01');
  });
});
