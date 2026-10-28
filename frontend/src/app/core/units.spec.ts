import { CM_PER_IN, KG_PER_LB, Units, defaultUnits, displayUnit, formatAmount, formatValue, parseAmount, toDisplay, toMetric } from './units';

const metric: Units = { weight: 'KG', length: 'CM' };
const imperial: Units = { weight: 'LB', length: 'IN' };

describe('units', () => {
  it('labels by metric unit and preference', () => {
    expect(displayUnit('kg', metric)).toBe('kg');
    expect(displayUnit('kg', imperial)).toBe('lb');
    expect(displayUnit('cm', metric)).toBe('cm');
    expect(displayUnit('cm', imperial)).toBe('in');
    expect(displayUnit(null, imperial)).toBe('lb');
  });

  it('converts weights and lengths both ways', () => {
    expect(toDisplay(KG_PER_LB * 200, 'kg', imperial)).toBeCloseTo(200);
    expect(toMetric(200, 'kg', imperial)).toBeCloseTo(90.7185, 3);
    expect(toDisplay(CM_PER_IN * 14, 'cm', imperial)).toBeCloseTo(14);
    expect(toMetric(14, 'cm', imperial)).toBeCloseTo(35.56);
    expect(toDisplay(82.4, 'kg', metric)).toBe(82.4);
  });

  it('keeps weight and length preferences separate', () => {
    const mixed: Units = { weight: 'LB', length: 'CM' };
    expect(displayUnit('kg', mixed)).toBe('lb');
    expect(displayUnit('cm', mixed)).toBe('cm');
    expect(toDisplay(40, 'cm', mixed)).toBe(40);
  });

  it('formats with one decimal', () => {
    expect(formatValue(88.2, 'kg', metric)).toBe('88.2');
    expect(formatAmount(88.2, 'kg', imperial)).toBe('194.4 lb');
    expect(formatAmount(40, 'cm', imperial)).toBe('15.7 in');
    expect(formatValue(null, 'kg', metric)).toBe('–');
  });

  it('parses input in the chosen unit back to metric', () => {
    expect(parseAmount('194,4', 'kg', imperial)).toBeCloseTo(88.18, 2);
    expect(parseAmount('82.5', 'kg', metric)).toBe(82.5);
    expect(parseAmount('abc', 'kg', metric)).toBeNull();
  });

  it('defaults to imperial only for imperial regions', () => {
    expect(defaultUnits('en-US')).toEqual({ weight: 'LB', length: 'IN' });
    expect(defaultUnits('cs-CZ')).toEqual({ weight: 'KG', length: 'CM' });
    expect(defaultUnits('en')).toEqual({ weight: 'KG', length: 'CM' });
  });
});
