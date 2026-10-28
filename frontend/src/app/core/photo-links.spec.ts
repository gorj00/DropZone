import { TestBed } from '@angular/core/testing';
import { PhotoLinks, linkExpired, photoKey, samePhoto, signedExpiry } from './photo-links';
import { SessionStore } from './session.store';
import { GoalStore, TodayStore } from './stores';

const plain = 'https://storage.googleapis.com/dz-bucket/uploads/u1/abc.jpg';
const signed = (hour: string, sig = 'aa11') =>
  `${plain}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=x&X-Goog-Date=20261028T${hour}0000Z&X-Goog-Expires=46800&X-Goog-SignedHeaders=host&X-Goog-Signature=${sig}`;

describe('photo link helpers', () => {
  it('compares photos without the query string', () => {
    expect(photoKey(signed('06'))).toBe(plain);
    expect(samePhoto(signed('06', 'aa'), signed('07', 'bb'))).toBe(true);
    expect(samePhoto(plain, signed('06'))).toBe(true);
    expect(samePhoto(signed('06'), `${plain.replace('abc', 'xyz')}?X-Goog-Signature=1`)).toBe(false);
    expect(samePhoto(null, undefined)).toBe(true);
    expect(samePhoto(null, plain)).toBe(false);
  });

  it('reads the expiry of a signed link and ignores plain links', () => {
    expect(signedExpiry(signed('06'))).toBe(Date.UTC(2026, 9, 28, 6) + 46_800_000);
    expect(signedExpiry(plain)).toBeNull();
    expect(signedExpiry('https://images.unsplash.com/photo-1?w=1080')).toBeNull();
  });

  it('treats a link as expired a minute before its end', () => {
    const end = Date.UTC(2026, 9, 28, 6) + 46_800_000;
    expect(linkExpired(signed('06'), end - 120_000)).toBe(false);
    expect(linkExpired(signed('06'), end - 30_000)).toBe(true);
    expect(linkExpired(plain, end + 1)).toBe(false);
  });
});

describe('PhotoLinks', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const session = { user: () => ({ id: 'u1' }), refresh: vi.fn().mockResolvedValue(null) };
    const goals = { goal: () => ({ id: 'g1' }), load: vi.fn().mockResolvedValue(null) };
    const today = { today: () => null, load: vi.fn().mockResolvedValue(null) };
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionStore, useValue: session },
        { provide: GoalStore, useValue: goals },
        { provide: TodayStore, useValue: today }
      ]
    });
    return { links: TestBed.inject(PhotoLinks), session, goals, today };
  }

  it('reloads the owning data once when an expired signed image fails', async () => {
    const { links, session, goals, today } = setup();
    const reload = vi.fn();
    TestBed.runInInjectionContext(() => links.onStale(reload));
    const late = Date.UTC(2026, 9, 29);
    expect(links.failed(signed('06'), late)).toBe(true);
    expect(links.failed(signed('06'), late)).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(goals.load).toHaveBeenCalledTimes(1);
    expect(today.load).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(links.stale()).toBe(1);
  });

  it('leaves broken plain or still valid links alone', async () => {
    const { links, goals } = setup();
    expect(links.failed(plain)).toBe(false);
    expect(links.failed(signed('06'), Date.UTC(2026, 9, 28, 7))).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    expect(goals.load).not.toHaveBeenCalled();
  });

  it('listens for image errors on the page', async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 30));
    const { links, goals } = setup();
    links.install();
    const img = document.createElement('img');
    document.body.appendChild(img);
    Object.defineProperty(img, 'currentSrc', { value: signed('01') });
    img.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(400);
    expect(goals.load).toHaveBeenCalledTimes(1);
    img.remove();
  });
});
