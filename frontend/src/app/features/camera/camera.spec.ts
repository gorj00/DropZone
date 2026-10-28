import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { CameraRequest, CameraService } from '../../core/camera.service';
import { VisionService } from '../../core/native/vision';
import { CameraPage } from './camera';

const stream = { getVideoTracks: () => [], getTracks: () => [] } as unknown as MediaStream;

async function render(targetReps: number | undefined, getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  const camera = { request: signal<CameraRequest | null>({ mode: 'REPS', title: 'Camera reps', targetReps }), finish: vi.fn(), cancel: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CameraService, useValue: camera },
      { provide: VisionService, useValue: { available: false } }
    ]
  });
  const fixture = TestBed.createComponent(CameraPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes(text))!;
  return { fixture, el, camera, button };
}

describe('CameraPage rep goal', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('asks for the squat goal or half of it as push-ups', async () => {
    const { fixture, el, button } = await render(15, () => new Promise(() => undefined));
    expect(el.textContent).toContain('of 15 squats');

    button('Push-ups').click();
    fixture.detectChanges();
    expect(el.textContent).toContain('of 8 push-ups');

    button('Squats').click();
    fixture.detectChanges();
    expect(el.textContent).toContain('of 15 squats');
  });

  it('falls back to 20 squats without a target', async () => {
    const { el } = await render(undefined, () => new Promise(() => undefined));
    expect(el.textContent).toContain('of 20 squats');
  });

  it('finishes a push-up session at half the goal and reports the exercise', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
    const { fixture, el, camera, button } = await render(20, () => Promise.resolve(stream));

    button('Push-ups').click();
    fixture.detectChanges();
    const start = () => el.querySelector<HTMLButtonElement>('[aria-label="Start counting"]')!;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(start().disabled).toBe(false);
    });
    start().click();
    fixture.detectChanges();
    const counter = button('of 10 push-ups');
    for (let i = 0; i < 9; i++) counter.click();
    expect(camera.finish).not.toHaveBeenCalled();

    counter.click();
    expect(camera.finish).toHaveBeenCalledWith(expect.objectContaining({ reps: 10, exercise: 'PUSHUP' }));
  });
});

describe('CameraPage AI check', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  async function shoot(labels: string[], check: CameraRequest['check']) {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => Promise.resolve(stream) } });
    const camera = { request: signal<CameraRequest | null>({ mode: 'PHOTO', title: 'Healthy meal proof', check }), finish: vi.fn(), cancel: vi.fn() };
    const vision = { available: false, analyzePhoto: vi.fn().mockResolvedValue({ labels, text: null, number: null }) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: CameraService, useValue: camera }, { provide: VisionService, useValue: vision }]
    });
    const fixture = TestBed.createComponent(CameraPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const shutter = () => el.querySelector<HTMLButtonElement>('[aria-label="Take photo"]')!;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(shutter().disabled).toBe(false);
    });
    shutter().click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('[data-test=verdict]')).not.toBeNull();
    });
    return { el, text: (sel: string) => el.querySelector(sel)?.textContent?.trim() };
  }

  it('says the photo looks like a meal when the labels match', async () => {
    const { text, el } = await shoot(['Food', 'Plate'], { quest: 'HEALTHY_MEAL' });
    expect(text('[data-test=verdict]')).toBe('Looks like a meal');
    expect(text('[data-test=verdict-note]')).toBe('Use it as proof.');
    expect(el.querySelector('.qok')).not.toBeNull();
  });

  it('warns that an unrecognised photo is saved as a photo proof', async () => {
    const { text, el } = await shoot(['Ceiling'], { quest: 'HEALTHY_MEAL' });
    expect(text('[data-test=verdict]')).toBe("Didn't recognise a meal");
    expect(text('[data-test=verdict-note]')).toBe("It'll be saved as a photo proof.");
    expect(el.querySelector('.qok')).toBeNull();
  });
});
