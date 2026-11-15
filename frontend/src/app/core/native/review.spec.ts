import { TestBed } from '@angular/core/testing';
import { ApiService } from '../api/api.service';
import { User } from '../api/models';
import { SessionStore } from '../session.store';
import { REVIEW, ReviewBridge, ReviewService } from './review';

function setup(bridge: Partial<ReviewBridge> = {}, user: Partial<User> = {}) {
  const fake: ReviewBridge = { native: true, ios: false, appStoreId: '', requestReview: vi.fn().mockResolvedValue(undefined), openAppStore: vi.fn().mockResolvedValue(undefined), ...bridge };
  const api = { updateMe: vi.fn((patch: object) => Promise.resolve({ id: 'me', reviewPrompted: true, ...patch })) };
  TestBed.configureTestingModule({ providers: [{ provide: REVIEW, useValue: fake }, { provide: ApiService, useValue: api }] });
  TestBed.inject(SessionStore).setUser({ id: 'me', reviewPrompted: false, ...user } as User);
  return { fake, api, review: TestBed.inject(ReviewService) };
}

describe('ReviewService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('marks the prompt as shown, then asks Play for the rating card once', async () => {
    const { fake, api, review } = setup();
    const first = review.promptOnce();
    await vi.runAllTimersAsync();
    await first;
    expect(api.updateMe).toHaveBeenCalledWith({ reviewPrompted: true });
    expect(fake.requestReview).toHaveBeenCalledTimes(1);

    await review.promptOnce();
    expect(fake.requestReview).toHaveBeenCalledTimes(1);
  });

  it('does nothing in the browser or when it was already shown', async () => {
    const web = setup({ native: false });
    await web.review.promptOnce();
    expect(web.fake.requestReview).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    const shown = setup({}, { reviewPrompted: true });
    await shown.review.promptOnce();
    expect(shown.fake.requestReview).not.toHaveBeenCalled();
  });

  it('opens the Play page on Android and hides the link on iPhone until the App Store id exists', async () => {
    const android = setup();
    expect(android.review.canOpenStore).toBe(true);
    await android.review.openStore();
    expect(android.fake.openAppStore).toHaveBeenCalledWith(undefined);

    TestBed.resetTestingModule();
    expect(setup({ ios: true }).review.canOpenStore).toBe(false);
    TestBed.resetTestingModule();
    const ios = setup({ ios: true, appStoreId: '123' });
    await ios.review.openStore();
    expect(ios.fake.openAppStore).toHaveBeenCalledWith('123');
  });
});
