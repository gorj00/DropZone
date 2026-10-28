import { DailyLog } from '../../core/api/models';
import { UnitsService } from '../../core/units';

export function logTitle(log: DailyLog): string {
  return log.slots > 1 ? `${log.quest.name} · Meal ${log.slot} of ${log.slots}` : log.quest.name;
}

export function logValue(log: DailyLog, units: UnitsService): string | null {
  const q = log.quest;
  if (q.code === 'WEIGH_IN' || q.proof === 'LOG') return log.value === null ? null : units.amount(log.value);
  if (q.proof === 'REPS') return log.reps === null ? null : `${log.reps} reps`;
  if (q.proof === 'AUTO') {
    if (log.value === null) return null;
    if (q.autoSource === 'SLEEP') {
      const m = Math.round(log.value);
      return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min sleep`;
    }
    return `${Math.round(log.value).toLocaleString('en-US')} steps`;
  }
  if (q.proof === 'CHECKIN') return 'Checked in';
  if (q.proof === 'NONE') return 'Done';
  return null;
}

export function logTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
