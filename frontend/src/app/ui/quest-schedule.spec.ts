import { TestBed } from '@angular/core/testing';
import { QuestSchedule, daysLabel, goalKindOf, goalOf, goalText, repsFor } from './quest-schedule';

describe('daysLabel', () => {
  it('names common schedules', () => {
    expect(daysLabel([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
    expect(daysLabel([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(daysLabel([6, 7])).toBe('Weekends');
    expect(daysLabel([1, 3, 5])).toBe('Mon, Wed, Fri');
  });
});

describe('QuestSchedule', () => {
  function setup(days: number[], perDay: number | null) {
    const f = TestBed.createComponent(QuestSchedule);
    f.componentRef.setInput('days', days);
    f.componentRef.setInput('perDay', perDay);
    f.detectChanges();
    const emitted = { days: [] as number[][], perDay: [] as number[] };
    f.componentInstance.daysChange.subscribe(d => emitted.days.push(d));
    f.componentInstance.perDayChange.subscribe(n => emitted.perDay.push(n));
    return { el: f.nativeElement as HTMLElement, emitted };
  }

  it('toggles days but never clears the last one', () => {
    const { el, emitted } = setup([1, 3], null);
    const chips = el.querySelectorAll<HTMLButtonElement>('.day');
    chips[1].click();
    chips[0].click();
    expect(emitted.days).toEqual([[1, 2, 3], [3]]);

    const single = setup([5], null);
    single.el.querySelectorAll<HTMLButtonElement>('.day')[4].click();
    expect(single.emitted.days).toEqual([]);
  });

  it('shows the meal stepper only when perDay is given', () => {
    expect(setup([1], null).el.querySelector('.stp')).toBeNull();
    const { el, emitted } = setup([1], 3);
    const [minus, plus] = Array.from(el.querySelectorAll<HTMLButtonElement>('.stp'));
    plus.click();
    minus.click();
    expect(emitted.perDay).toEqual([4, 2]);
  });
});

describe('goalText', () => {
  it('formats step and sleep goals', () => {
    expect(goalText('STEPS', 12000)).toBe('12,000 steps');
    expect(goalText('SLEEP', 450)).toBe('7.5 h sleep');
    expect(goalText('SLEEP', 480)).toBe('8 h sleep');
  });
});

describe('QuestSchedule daily goal', () => {
  function setup(goal: number, kind: 'STEPS' | 'SLEEP') {
    const f = TestBed.createComponent(QuestSchedule);
    f.componentRef.setInput('goal', goal);
    f.componentRef.setInput('goalKind', kind);
    f.detectChanges();
    const emitted: number[] = [];
    f.componentInstance.goalChange.subscribe(v => emitted.push(v));
    const el = f.nativeElement as HTMLElement;
    return {
      emitted,
      raise: el.querySelector('[aria-label="Raise daily goal"]') as HTMLButtonElement,
      lower: el.querySelector('[aria-label="Lower daily goal"]') as HTMLButtonElement
    };
  }

  it('steps by 500 steps within bounds', () => {
    const s = setup(8000, 'STEPS');
    s.raise.click();
    s.lower.click();
    expect(s.emitted).toEqual([8500, 7500]);
    expect(setup(1000, 'STEPS').lower.disabled).toBe(true);
  });

  it('steps sleep by half an hour', () => {
    const s = setup(480, 'SLEEP');
    s.raise.click();
    expect(s.emitted).toEqual([510]);
    expect(setup(720, 'SLEEP').raise.disabled).toBe(true);
  });

  it('hides the goal for quests without one', () => {
    const f = TestBed.createComponent(QuestSchedule);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).not.toContain('Daily goal');
  });
});

describe('rep goals', () => {
  it('needs half the squats as push-ups, rounded up', () => {
    expect(repsFor(20, 'SQUAT')).toBe(20);
    expect(repsFor(20, 'PUSHUP')).toBe(10);
    expect(repsFor(15, 'PUSHUP')).toBe(8);
    expect(goalText('REPS', 40)).toBe('40 squats or 20 push-ups');
  });

  it('treats REPS quests as having a goal of 20 by default', () => {
    expect(goalKindOf({ proof: 'REPS', autoSource: null })).toBe('REPS');
    expect(goalKindOf({ proof: 'PHOTO', autoSource: null })).toBeNull();
    expect(goalOf({ proof: 'REPS', autoSource: null, target: null })).toBe(20);
    expect(goalOf({ proof: 'REPS', autoSource: null, target: 20 }, 40)).toBe(40);
    expect(goalOf({ proof: 'PHOTO', autoSource: null, target: null })).toBeNull();
  });
});

describe('QuestSchedule rep goal', () => {
  function setup(goal: number) {
    const f = TestBed.createComponent(QuestSchedule);
    f.componentRef.setInput('goal', goal);
    f.componentRef.setInput('goalKind', 'REPS');
    f.detectChanges();
    const emitted: number[] = [];
    f.componentInstance.goalChange.subscribe(v => emitted.push(v));
    const el = f.nativeElement as HTMLElement;
    const chip = (text: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('button.chip')).find(b => b.textContent?.includes(text))!;
    const custom = el.querySelector<HTMLInputElement>('input[placeholder="Custom"]')!;
    const type = (value: string) => {
      custom.value = value;
      custom.dispatchEvent(new Event('change'));
    };
    return { el, emitted, chip, custom, type };
  }

  it('offers Easy, Medium and Hard with Medium on for 20', () => {
    const { el, emitted, chip } = setup(20);
    expect(Array.from(el.querySelectorAll('button.chip')).map(b => b.textContent?.trim())).toEqual(['Easy 10', 'Medium 20', 'Hard 40']);
    expect(chip('Medium').getAttribute('aria-pressed')).toBe('true');
    expect(el.textContent).toContain('20 squats or 10 push-ups');
    expect(el.textContent).not.toContain('Lower daily goal');
    chip('Hard').click();
    chip('Medium').click();
    expect(emitted).toEqual([40]);
  });

  it('takes a custom number from 5 to 200', () => {
    const { emitted, custom, type } = setup(20);
    type('75');
    type('4');
    expect(custom.value).toBe('');
    type('201');
    type('abc');
    type('5');
    type('200');
    expect(emitted).toEqual([75, 5, 200]);
  });

  it('shows a custom goal in the number field', () => {
    const { chip, custom } = setup(75);
    expect(custom.value).toBe('75');
    expect(chip('Medium').getAttribute('aria-pressed')).toBe('false');
  });
});
