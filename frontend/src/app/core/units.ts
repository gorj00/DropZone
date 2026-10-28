import { Injectable, computed, inject } from '@angular/core';
import { LengthUnit, WeightUnit } from './api/models';
import { SessionStore } from './session.store';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export interface Units {
  weight: WeightUnit;
  length: LengthUnit;
}

export type DisplayUnit = 'kg' | 'lb' | 'cm' | 'in';

export const METRIC_UNITS: Units = { weight: 'KG', length: 'CM' };

const IMPERIAL_REGIONS = ['US', 'LR', 'MM'];

export function defaultUnits(locale = typeof navigator === 'undefined' ? 'en' : navigator.language): Units {
  const region = locale.split(/[-_]/)[1]?.toUpperCase();
  return region && IMPERIAL_REGIONS.includes(region) ? { weight: 'LB', length: 'IN' } : METRIC_UNITS;
}

export function isLength(metric: string | null | undefined): boolean {
  return (metric ?? '').toLowerCase() === 'cm';
}

export function displayUnit(metric: string | null | undefined, u: Units): DisplayUnit {
  if (isLength(metric)) return u.length === 'IN' ? 'in' : 'cm';
  return u.weight === 'LB' ? 'lb' : 'kg';
}

function factor(metric: string | null | undefined, u: Units): number {
  if (isLength(metric)) return u.length === 'IN' ? 1 / CM_PER_IN : 1;
  return u.weight === 'LB' ? 1 / KG_PER_LB : 1;
}

export function toDisplay(value: number, metric: string | null | undefined, u: Units): number {
  return value * factor(metric, u);
}

export function toMetric(value: number, metric: string | null | undefined, u: Units): number {
  return value / factor(metric, u);
}

export function formatValue(value: number | null | undefined, metric: string | null | undefined, u: Units, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  return toDisplay(value, metric, u).toFixed(digits);
}

export function formatAmount(value: number | null | undefined, metric: string | null | undefined, u: Units, digits = 1): string {
  return `${formatValue(value, metric, u, digits)} ${displayUnit(metric, u)}`;
}

export function parseAmount(raw: string, metric: string | null | undefined, u: Units): number | null {
  const v = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(v) ? toMetric(v, metric, u) : null;
}

@Injectable({ providedIn: 'root' })
export class UnitsService {
  private readonly session = inject(SessionStore);

  readonly units = computed<Units>(() => {
    const u = this.session.user();
    return { weight: u?.weightUnit ?? 'KG', length: u?.lengthUnit ?? 'CM' };
  });
  readonly weightLabel = computed(() => displayUnit('kg', this.units()));
  readonly lengthLabel = computed(() => displayUnit('cm', this.units()));

  label(metric: string | null | undefined = 'kg'): DisplayUnit {
    return displayUnit(metric, this.units());
  }

  value(v: number, metric: string | null | undefined = 'kg'): number {
    return toDisplay(v, metric, this.units());
  }

  fmt(v: number | null | undefined, metric: string | null | undefined = 'kg', digits = 1): string {
    return formatValue(v, metric, this.units(), digits);
  }

  amount(v: number | null | undefined, metric: string | null | undefined = 'kg', digits = 1): string {
    return formatAmount(v, metric, this.units(), digits);
  }

  withNote(v: number | null | undefined, note: string | null | undefined, metric: string | null | undefined = 'kg'): string | null {
    if (v === null || v === undefined) return note ?? null;
    return note ? `${this.amount(v, metric)} · ${note}` : this.amount(v, metric);
  }

  toMetric(v: number, metric: string | null | undefined = 'kg'): number {
    return Math.round(toMetric(v, metric, this.units()) * 1000) / 1000;
  }
}
