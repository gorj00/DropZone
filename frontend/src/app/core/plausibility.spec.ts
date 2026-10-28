import { METRIC_UNITS } from './units';
import { boundsError, displayBounds, isBigJump, proofTolerance, rangeText, reachesTarget } from './plausibility';

const imperial = { weight: 'LB', length: 'IN' } as const;

describe('metric bounds', () => {
  it('uses the backend ranges per metric', () => {
    expect(rangeText('WEIGHT', METRIC_UNITS)).toBe('20–350 kg');
    expect(rangeText('STRENGTH', METRIC_UNITS)).toBe('1–500 kg');
    expect(rangeText('SIZE', METRIC_UNITS)).toBe('5–250 cm');
  });

  it('rounds the shown range inwards in imperial units', () => {
    expect(displayBounds('WEIGHT', imperial)).toEqual({ min: 44.1, max: 771.6 });
    expect(displayBounds('SIZE', imperial, 2)).toEqual({ min: 1.97, max: 98.42 });
  });

  it('names the field and the range when a value is outside', () => {
    expect(boundsError('WEIGHT', 3, METRIC_UNITS, 'Target')).toBe('Target must be between 20 and 350 kg.');
    expect(boundsError('WEIGHT', 3000, METRIC_UNITS, 'Target')).not.toBeNull();
    expect(boundsError('WEIGHT', 20, METRIC_UNITS, 'Target')).toBeNull();
    expect(boundsError('SIZE', 4.9, METRIC_UNITS, 'Start')).toBe('Start must be between 5 and 250 cm.');
  });
});

describe('big jump', () => {
  it('asks when a kg value moves more than 15 kg and more than 20 %', () => {
    expect(isBigJump(70, 85, 'kg')).toBe(false);
    expect(isBigJump(70, 85.5, 'kg')).toBe(true);
    expect(isBigJump(70, 700, 'kg')).toBe(true);
    expect(isBigJump(90, 30, 'kg')).toBe(true);
    expect(isBigJump(120, 143, 'kg')).toBe(false);
    expect(isBigJump(120, 145, 'kg')).toBe(true);
  });

  it('uses 20 % for centimetres', () => {
    expect(isBigJump(40, 47.9, 'cm')).toBe(false);
    expect(isBigJump(40, 48.5, 'cm')).toBe(true);
  });

  it('never asks without a current value', () => {
    expect(isBigJump(null, 700, 'kg')).toBe(false);
    expect(isBigJump(0, 700, 'kg')).toBe(false);
  });
});

describe('milestone target check', () => {
  it('accepts values that show as the target', () => {
    const kg = proofTolerance('kg', METRIC_UNITS);
    expect(reachesTarget('LOSE', 80.04, 80, kg)).toBe(true);
    expect(reachesTarget('LOSE', 80.1, 80, kg)).toBe(false);
    expect(reachesTarget('GAIN', 99.96, 100, kg)).toBe(true);
    expect(reachesTarget('GAIN', 99.9, 100, kg)).toBe(false);
  });

  it('uses half a pound for pound users', () => {
    expect(proofTolerance('kg', imperial)).toBeCloseTo(0.0227, 4);
    expect(proofTolerance('cm', imperial)).toBeCloseTo(0.127, 3);
  });
});
