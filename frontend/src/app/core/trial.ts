const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function trialLeft(endsAt: string | null | undefined, now = Date.now()): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (!(ms > 0)) return null;
  if (ms < DAY) {
    const h = Math.ceil(ms / HOUR);
    return `${h} ${h === 1 ? 'hour' : 'hours'} left`;
  }
  const d = Math.ceil(ms / DAY);
  return `${d} ${d === 1 ? 'day' : 'days'} left`;
}

export function trialBillingNote(endsAt: string | null | undefined, now = Date.now()): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (!(ms > 0)) return null;
  const d = Math.ceil(ms / DAY);
  return `Billing starts today; your remaining ${d} trial ${d === 1 ? 'day ends' : 'days end'} now.`;
}

export function trialEnd(endsAt: string, withTime = true): string {
  const d = new Date(endsAt);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return withTime ? `${day}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : day;
}
