import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { cameraVerdict } from '../../core/ai-check';
import { CameraResult, CameraService } from '../../core/camera.service';
import { Exercise, PhotoAnalysis, RepCounter, ScaleCrop, ScaleUnit, VisionService } from '../../core/native/vision';
import { ThemeService } from '../../core/theme.service';
import { environment } from '../../../environments/environment';
import { Icon } from '../../ui/icon';
import { DEFAULT_REPS, repsFor } from '../../ui/quest-schedule';

type Phase = 'starting' | 'live' | 'analyzing' | 'review' | 'counting' | 'error';

const EXERCISE_KEY = 'dz-rep-exercise';

function savedExercise(): Exercise | null {
  try {
    const v = localStorage.getItem(EXERCISE_KEY);
    return v === 'SQUAT' || v === 'PUSHUP' ? v : null;
  } catch {
    return null;
  }
}

function parseValue(raw: string, unit: ScaleUnit): number | null {
  const v = parseFloat(raw.replace(',', '.'));
  const [min, max] = unit === 'lb' ? [44, 772] : [20, 350];
  return Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10) / 10 : null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { class: 'block' },
  styles: `
    .scan { position: absolute; left: 30px; right: 30px; height: 2px; background: linear-gradient(90deg, transparent, var(--accent-2), transparent); box-shadow: 0 0 14px var(--accent-2); animation: scan 2.6s ease-in-out infinite; z-index: 3; }
    @keyframes scan { 0%, 100% { top: 14%; } 50% { top: 78%; } }
    .beat { display: inline-block; animation: beat 1.8s ease-in-out infinite; }
    @keyframes beat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
    .corner { position: absolute; width: 34px; height: 34px; z-index: 3; border-color: var(--bracket); }
  `,
  template: `
    <div class="fixed inset-0 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
         [style.background]="theme.isNeon() ? '#07051a' : '#000'" [style.--bracket]="theme.isNeon() ? 'var(--accent)' : '#fff'">
      <div class="px-4 h-[52px] flex items-center justify-between gap-2 flex-none">
        <button class="circ glass" aria-label="Close camera" (click)="close()"><app-icon name="close" /></button>
        <span class="chip glass text-[12px] px-3 py-[7px] uppercase min-w-0 truncate"><span class="text-accent2"><app-icon [name]="modeIcon()" /></span>{{ req()?.title }}</span>
        <span class="chip" style="background:rgba(var(--accent-rgb),.15);border-color:rgba(var(--accent-rgb),.45);color:var(--accent-light)">
          <span class="w-2 h-2 rounded-full inline-block" style="background:var(--accent);box-shadow:0 0 8px var(--accent)"></span>LIVE
        </span>
      </div>

      <div class="mx-3 mt-2 flex-1 min-h-0 rounded-[28px] relative overflow-hidden bg-[linear-gradient(160deg,#35304a,#1a1726)] touch-none"
           (touchstart)="pinchStart($event)" (touchmove)="pinchMove($event)" (touchend)="pinchEnd($event)">
        <video #video class="absolute inset-0 w-full h-full object-cover" [class.invisible]="phase() === 'starting'" [style.transform]="videoTransform()" poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" autoplay playsinline muted disablepictureinpicture></video>
        @if (shot(); as s) { <img class="absolute inset-0 w-full h-full object-cover z-[1]" [style.transform]="cssZoom() !== 1 ? 'scale(' + cssZoom() + ')' : null" [src]="s" alt="Captured proof"> }
        <div class="absolute inset-0 z-[2] pointer-events-none" style="background:radial-gradient(circle at 50% 42%,transparent 30%,rgba(0,0,0,.55) 100%)"></div>
        @if (phase() === 'live' || phase() === 'analyzing' || phase() === 'counting') { <div class="scan"></div> }
        @if (mode() === 'WEIGH_IN' && (phase() === 'live' || phase() === 'starting')) {
          <div #displayBox class="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 w-[64%] aspect-[2.4/1] z-[4] rounded-2xl border-[3px] pointer-events-none"
               style="border-color:var(--accent-2);box-shadow:0 0 0 9999px rgba(0,0,0,.35),0 0 18px rgba(var(--accent-2-rgb),.6)"></div>
          <div class="absolute inset-x-0 top-[calc(42%+19vw)] z-[5] flex flex-col items-center gap-2">
            <span class="chip glass text-[12px] px-3 py-[7px] pointer-events-none">Fit the scale's display in the box · pinch to zoom</span>
            <div class="seg3 glass grid-cols-3 w-[168px]" role="radiogroup" aria-label="Zoom">
              @for (z of zoomSteps; track z) {
                <button role="radio" [attr.aria-checked]="nearZoom() === z" [class.on]="nearZoom() === z" (click)="setZoom(z)">{{ z }}×</button>
              }
            </div>
          </div>
        }
        <div class="corner left-[30px] top-[44px] border-l-[3px] border-t-[3px] rounded-tl-xl"></div>
        <div class="corner right-[30px] top-[44px] border-r-[3px] border-t-[3px] rounded-tr-xl"></div>
        <div class="corner left-[30px] bottom-[96px] border-l-[3px] border-b-[3px] rounded-bl-xl"></div>
        <div class="corner right-[30px] bottom-[96px] border-r-[3px] border-b-[3px] rounded-br-xl"></div>

        @if (mode() === 'REPS' && (phase() === 'live' || phase() === 'starting')) {
          <div class="absolute top-4 inset-x-0 z-[5] flex justify-center">
            <div class="seg3 glass grid-cols-2 w-[220px]" role="radiogroup" aria-label="Exercise">
              <button role="radio" [attr.aria-checked]="exercise() === 'SQUAT'" [class.on]="exercise() === 'SQUAT'" (click)="setExercise('SQUAT')">Squats</button>
              <button role="radio" [attr.aria-checked]="exercise() === 'PUSHUP'" [class.on]="exercise() === 'PUSHUP'" (click)="setExercise('PUSHUP')">Push-ups</button>
            </div>
          </div>
        }
        @if (mode() === 'REPS' && phase() !== 'error') {
          <button class="absolute inset-x-0 top-[22%] z-[4] flex flex-col items-center" [disabled]="vision.available || phase() !== 'counting'" (click)="addRep()">
            <span class="num text-[96px] leading-none glow-text">{{ reps() }}</span>
            <span class="h text-[18px] tracking-[.12em] text-mute mt-1">of {{ target() }} {{ exerciseName() }}</span>
          </button>
        }

        @if (phase() === 'starting') {
          <div class="absolute inset-0 z-[4] grid place-items-center text-mute text-[13px] font-semibold">Starting camera…</div>
        }
        @if (phase() === 'error') {
          <div class="absolute inset-0 z-[4] grid place-items-center p-8">
            <div class="text-center">
              <span class="inline-grid place-items-center w-14 h-14 rounded-2xl bg-white/[.06] text-mute"><app-icon name="imgoff" [size]="26" /></span>
              <p class="font-bold mt-3">{{ errorText() }}</p>
              <button class="btn btn-ghost btn-sm mx-auto mt-4" (click)="startStream()"><app-icon name="refresh" />Try again</button>
            </div>
          </div>
        }

        <div class="absolute left-3 right-3 bottom-3 z-[5] glass rounded-2xl p-3 flex items-center gap-3">
          <span class="qi" style="background:rgba(var(--accent-2-rgb),.15);color:var(--accent-2)"><app-icon name="ai" /></span>
          <div class="flex-1 min-w-0">
            @switch (phase()) {
              @case ('analyzing') {
                <div class="lbl text-accent2">AI check</div>
                <div class="num text-[20px] leading-tight">Analysing…</div>
              }
              @case ('review') {
                @if (mode() === 'WEIGH_IN') {
                  <div class="lbl text-accent2">{{ analysis()?.number !== null ? 'AI read' : 'Scale reading' }}</div>
                  <div class="flex items-baseline gap-1">
                    <input class="num text-[22px] leading-tight bg-transparent border-0 outline-none p-0 w-[5ch]" type="text" inputmode="decimal" enterkeyhint="done"
                           aria-label="Weight on the scale" placeholder="00.0" [value]="value()" (input)="value.set($any($event.target).value)" (keydown.enter)="$any($event.target).blur()">
                    <span class="num text-[16px] uppercase">{{ scaleUnit() }}</span>
                  </div>
                  <div class="text-[12px] text-mute truncate" data-test="verdict-note">{{ validValue() === null ? 'Enter what the scale shows' : verdict()?.ok === false ? "Scale not read · it'll be saved as a photo proof" : 'Tap the number to fix it' }}</div>
                } @else if (verdict(); as v) {
                  <div class="lbl text-accent2">AI check</div>
                  <div class="font-bold text-[15px] leading-tight truncate" data-test="verdict">{{ v.title }}</div>
                  <div class="text-[12px] text-mute truncate" data-test="verdict-note">{{ v.note }}</div>
                } @else {
                  <div class="lbl text-accent2">AI check</div>
                  <div class="font-bold text-[15px] leading-tight truncate">{{ labelText() }}</div>
                  <div class="text-[12px] text-mute">Looks good? Use it as proof.</div>
                }
              }
              @case ('counting') {
                <div class="lbl text-accent2">Counting reps</div>
                <div class="num text-[20px] leading-tight">{{ reps() }} / {{ target() }}</div>
                <div class="text-[12px] text-mute truncate">{{ vision.available ? 'Full body in frame, go!' : 'Tap the counter to add reps (web)' }}</div>
              }
              @default {
                <div class="lbl text-accent2">{{ mode() === 'REPS' ? 'Rep counter' : 'AI check' }}</div>
                <div class="font-bold text-[15px] leading-tight truncate">{{ hint() }}</div>
              }
            }
          </div>
          @if (phase() === 'review' && (mode() !== 'WEIGH_IN' || validValue() !== null) && verdict()?.ok !== false) { <span class="qok"><app-icon name="check" /></span> }
        </div>
      </div>

      <p class="text-center text-mute font-medium text-[12.5px] mt-3 flex items-center justify-center gap-1.5 flex-none">
        <app-icon name="lock" [size]="13" />Live camera only. No photos from your gallery.
      </p>

      @if (phase() === 'review') {
        <div class="flex-none px-5 pt-5 pb-8 flex gap-3">
          <button class="btn btn-ghost flex-1" (click)="retake()"><app-icon name="refresh" />Retake</button>
          <button class="btn btn-primary flex-[1.4]" [disabled]="mode() === 'WEIGH_IN' && validValue() === null" (click)="use()"><app-icon name="check" />Use photo</button>
        </div>
      } @else {
        <div class="flex-none pt-5 pb-10 px-10 flex items-center justify-between">
          <span class="w-12 h-12 rounded-2xl bg-white/[.06] grid place-items-center text-mute opacity-50" aria-hidden="true"><app-icon name="imgoff" /></span>
          <button class="w-[80px] h-[80px] rounded-full grid place-items-center disabled:opacity-40"
                  style="box-shadow:0 0 0 3px var(--accent),0 0 30px rgba(var(--accent-rgb),.75)"
                  [class.pulse]="mode() === 'REPS' && phase() === 'live'"
                  [attr.aria-label]="shutterLabel()" [disabled]="phase() !== 'live' && phase() !== 'counting'" (click)="shutter()">
            @if (phase() === 'counting') {
              <span class="w-[34px] h-[34px] rounded-lg" style="background:var(--accent)"></span>
            } @else {
              <span class="w-[64px] h-[64px] rounded-full bg-white grid place-items-center text-[#0b0c10]">
                @if (mode() === 'REPS') { <span class="h text-[64px] leading-none" [class.beat]="phase() === 'live'">Go</span> }
              </span>
            }
          </button>
          <button class="w-12 h-12 rounded-2xl bg-white/[.08] grid place-items-center" aria-label="Flip camera" (click)="flip()"><app-icon name="flip" /></button>
        </div>
      }
    </div>
  `
})
export class CameraPage implements OnDestroy {
  protected readonly theme = inject(ThemeService);
  protected readonly vision = inject(VisionService);
  private readonly camera = inject(CameraService);
  private readonly router = inject(Router);
  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly boxRef = viewChild<ElementRef<HTMLElement>>('displayBox');

  protected readonly req = this.camera.request;
  protected readonly phase = signal<Phase>('starting');
  protected readonly facing = signal<'user' | 'environment'>(this.camera.request()?.mode === 'REPS' ? 'user' : 'environment');
  protected readonly shot = signal<string | null>(null);
  protected readonly analysis = signal<PhotoAnalysis | null>(null);
  protected readonly value = signal('');
  protected readonly reps = signal(0);
  protected readonly errorText = signal('');
  protected readonly exercise = signal<Exercise>(savedExercise() ?? this.camera.request()?.exercise ?? 'SQUAT');

  protected readonly mode = computed(() => this.req()?.mode ?? 'PHOTO');
  protected readonly target = computed(() => repsFor(this.req()?.targetReps ?? DEFAULT_REPS, this.exercise()));
  protected readonly exerciseName = computed(() => (this.exercise() === 'PUSHUP' ? 'push-ups' : 'squats'));
  protected readonly modeIcon = computed(() => (this.mode() === 'WEIGH_IN' ? 'scale' : this.mode() === 'REPS' ? 'reps' : 'camera'));
  protected readonly scaleUnit = computed<ScaleUnit>(() => this.req()?.unit ?? 'kg');
  protected readonly validValue = computed(() => parseValue(this.value(), this.scaleUnit()));
  protected readonly labelText = computed(() => {
    const labels = this.analysis()?.labels ?? [];
    return labels.length ? labels.slice(0, 3).join(' · ') : 'Nothing recognised, still fine';
  });
  protected readonly verdict = computed(() => {
    const a = this.analysis();
    return a ? cameraVerdict(this.req()?.check, a.labels, a.text) : null;
  });
  protected readonly hint = computed(() => {
    switch (this.mode()) {
      case 'WEIGH_IN': return 'Feet + display in frame';
      case 'REPS': return this.exercise() === 'PUSHUP' ? 'Phone on the floor, side view, whole body in frame' : 'Phone down, whole body in frame';
      default: return 'Keep the proof clearly in frame';
    }
  });
  protected readonly shutterLabel = computed(() => (this.phase() === 'counting' ? 'Stop counting' : this.mode() === 'REPS' ? 'Start counting' : 'Take photo'));

  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private zoomRange: { min: number; max: number } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;
  protected readonly zoomSteps = [1, 2, 3];
  protected readonly zoom = signal(1);
  protected readonly cssZoom = signal(1);
  protected readonly nearZoom = computed(() => this.zoomSteps.reduce((a, b) => (Math.abs(b - this.zoom()) < Math.abs(a - this.zoom()) ? b : a)));
  protected readonly videoTransform = computed(() => {
    const parts = [this.cssZoom() !== 1 ? `scale(${this.cssZoom()})` : '', this.facing() === 'user' ? 'scaleX(-1)' : ''].filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  });

  protected setZoom(z: number): void {
    const track = this.stream?.getVideoTracks()[0];
    const range = this.zoomRange;
    const next = Math.min(Math.max(z, 1), range ? Math.max(range.max, 1) : 5);
    this.zoom.set(next);
    if (track && range) {
      const hw = Math.min(Math.max(next, range.min), range.max);
      void track.applyConstraints({ advanced: [{ zoom: hw } as MediaTrackConstraintSet] }).catch(() => this.cssZoom.set(next));
    } else {
      this.cssZoom.set(next);
    }
  }

  protected pinchStart(e: TouchEvent): void {
    if (e.touches.length === 2) this.pinch = { dist: this.touchDist(e), zoom: this.zoom() };
  }

  protected pinchMove(e: TouchEvent): void {
    if (!this.pinch || e.touches.length !== 2) return;
    e.preventDefault();
    this.setZoom(Math.round(this.pinch.zoom * (this.touchDist(e) / this.pinch.dist) * 10) / 10);
  }

  protected pinchEnd(e: TouchEvent): void {
    if (e.touches.length < 2) this.pinch = null;
  }

  private touchDist(e: TouchEvent): number {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
  }
  private counter: RepCounter | null = null;
  private counting = false;
  private destroyed = false;
  private readonly onVisible = () => {
    const live = this.stream?.getVideoTracks().some(t => t.readyState === 'live');
    if (document.visibilityState === 'visible' && !live && (this.phase() === 'live' || this.phase() === 'counting')) void this.startStream();
  };

  constructor() {
    if (!this.camera.request()) {
      void this.router.navigateByUrl('/today', { replaceUrl: true });
      return;
    }
    document.addEventListener('visibilitychange', this.onVisible);
    afterNextRender(() => void this.startStream());
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.counting = false;
    document.removeEventListener('visibilitychange', this.onVisible);
    this.stopStream();
    this.camera.cancel();
  }

  protected async startStream(): Promise<void> {
    this.stopStream();
    const resume: Phase = this.counting ? 'counting' : 'live';
    this.phase.set('starting');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fail('Camera is not available on this device.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: this.facing() }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      if (this.destroyed) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      this.stream = stream;
      const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number; max: number } }) | undefined;
      this.zoomRange = caps?.zoom && caps.zoom.max > 1 ? { min: caps.zoom.min, max: caps.zoom.max } : null;
      const v = this.videoRef()?.nativeElement;
      if (!v) return;
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      this.setZoom(this.zoom());
      this.phase.set(this.shot() ? 'review' : resume);
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      this.fail(denied ? 'Camera access is blocked. Allow it in your phone settings.' : 'Could not start the camera.');
    }
  }

  protected flip(): void {
    this.facing.update(f => (f === 'user' ? 'environment' : 'user'));
    void this.startStream();
  }

  protected shutter(): void {
    if (this.mode() === 'REPS') {
      if (this.phase() === 'counting') void this.stopCounting();
      else if (this.phase() === 'live') this.startCounting();
      return;
    }
    void this.shoot();
  }

  protected retake(): void {
    this.shot.set(null);
    this.analysis.set(null);
    this.value.set('');
    this.phase.set('live');
  }

  protected use(): void {
    const dataUrl = this.shot();
    if (!dataUrl) return;
    const a = this.analysis();
    const number = this.mode() === 'WEIGH_IN' ? this.validValue() : null;
    if (this.mode() === 'WEIGH_IN' && number === null) return;
    this.done({ dataUrl, labels: a?.labels ?? [], text: a?.text ?? null, number, reps: null });
  }

  protected close(): void {
    this.done(null);
  }

  protected setExercise(e: Exercise): void {
    if (this.counting) return;
    this.exercise.set(e);
    try { localStorage.setItem(EXERCISE_KEY, e); } catch { }
  }

  protected addRep(): void {
    if (!this.vision.available && this.phase() === 'counting') {
      this.reps.update(r => r + 1);
      if (this.reps() >= this.target()) void this.finishReps();
    }
  }

  private async shoot(): Promise<void> {
    if (this.phase() !== 'live') return;
    const crop = this.mode() === 'WEIGH_IN' ? this.displayCrop() : null;
    const data = this.grab(1600, 0.85);
    if (!data) return;
    this.shot.set(data);
    this.phase.set('analyzing');
    let a: PhotoAnalysis = { labels: [], text: null, number: null };
    try {
      if (this.mode() === 'WEIGH_IN') {
        const still = await this.stillCrop().catch(() => null);
        a = await this.vision.analyzeScale(data, [still, crop].filter((c): c is ScaleCrop => !!c), this.req()?.expected, this.scaleUnit());
      } else {
        a = await this.vision.analyzePhoto(data, false);
      }
    } catch { }
    if (this.destroyed || !this.shot()) return;
    this.analysis.set(a);
    this.value.set(a.number !== null ? a.number.toFixed(1) : '');
    this.phase.set('review');
  }

  private startCounting(): void {
    this.counter = new RepCounter(this.exercise());
    this.reps.set(0);
    this.counting = true;
    this.phase.set('counting');
    void this.loop();
  }

  private async stopCounting(): Promise<void> {
    if (this.reps() > 0) {
      await this.finishReps();
      return;
    }
    this.counting = false;
    this.phase.set('live');
  }

  private async loop(): Promise<void> {
    while (this.counting && !this.destroyed) {
      const started = performance.now();
      if (this.vision.available && this.phase() === 'counting') {
        const frame = this.grab(480, 0.7);
        if (frame) {
          try {
            const landmarks = await this.vision.pose(frame);
            if (!environment.production) {
              const keep = landmarks.filter(l => /Shoulder|Elbow|Wrist|Hip|Knee|Ankle|Nose/.test(l.type));
              console.log('[dz-pose]', JSON.stringify({ t: Math.round(performance.now()), ex: this.exercise(), reps: this.reps(), lm: keep.map(l => [l.type, Math.round(l.x), Math.round(l.y), Math.round(l.inFrameLikelihood * 100) / 100]) }));
            }
            this.reps.set(this.counter?.feed(landmarks) ?? this.reps());
          } catch { }
        }
        if (this.counting && this.reps() >= this.target()) {
          await this.finishReps();
          return;
        }
      }
      await new Promise(r => setTimeout(r, Math.max(0, 166 - (performance.now() - started))));
    }
  }

  private async finishReps(): Promise<void> {
    if (!this.counting) return;
    this.counting = false;
    const dataUrl = this.grab(1600, 0.85);
    if (!dataUrl) {
      this.phase.set('live');
      return;
    }
    this.done({ dataUrl, labels: [], text: null, number: null, reps: this.reps(), exercise: this.exercise() });
  }

  private grab(maxSide: number, quality: number): string | null {
    const v = this.videoRef()?.nativeElement;
    if (!v || !v.videoWidth || !v.videoHeight) return null;
    const scale = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    const c = (this.canvas ??= document.createElement('canvas'));
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL('image/jpeg', quality);
  }

  private boxInVideo(): { sx: number; sy: number; sw: number; sh: number } | null {
    const v = this.videoRef()?.nativeElement;
    const box = this.boxRef()?.nativeElement;
    if (!v || !box || !v.videoWidth || !v.videoHeight) return null;
    const view = v.getBoundingClientRect();
    const r = box.getBoundingClientRect();
    const s = Math.max(view.width / v.videoWidth, view.height / v.videoHeight);
    const ox = (view.width - v.videoWidth * s) / 2;
    const oy = (view.height - v.videoHeight * s) / 2;
    const sw = r.width / s;
    const sh = r.height / s;
    let sx = (r.left - view.left - ox) / s;
    const sy = (r.top - view.top - oy) / s;
    if (this.facing() === 'user') sx = v.videoWidth - sx - sw;
    return { sx, sy, sw, sh };
  }

  private cropToGray(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, width: number): ScaleCrop | null {
    const height = Math.round((width * sh) / sw);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'grayscale(1) contrast(1.3)';
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++) gray[i] = Math.round(rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114);
    return { gray: { width, height, data: gray }, dataUrl: c.toDataURL('image/jpeg', 0.92) };
  }

  private displayCrop(): ScaleCrop | null {
    const v = this.videoRef()?.nativeElement;
    const b = this.boxInVideo();
    return v && b ? this.cropToGray(v, b.sx, b.sy, b.sw, b.sh, 640) : null;
  }

  private async stillCrop(): Promise<ScaleCrop | null> {
    const v = this.videoRef()?.nativeElement;
    const track = this.stream?.getVideoTracks()[0];
    const b = this.boxInVideo();
    if (!v || !track || !b || typeof ImageCapture === 'undefined') return null;
    const capture = new ImageCapture(track);
    const caps = await capture.getPhotoCapabilities();
    const blob = await capture.takePhoto({ imageWidth: caps.imageWidth?.max, imageHeight: caps.imageHeight?.max });
    const photo = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    if (photo.width > photo.height !== v.videoWidth > v.videoHeight) return null;
    const k = Math.max(v.videoWidth / photo.width, v.videoHeight / photo.height);
    const ox = (v.videoWidth - photo.width * k) / 2;
    const oy = (v.videoHeight - photo.height * k) / 2;
    const sw = b.sw / k;
    const crop = this.cropToGray(photo, (b.sx - ox) / k, (b.sy - oy) / k, sw, b.sh / k, Math.min(1280, Math.max(640, Math.round(sw))));
    if (crop && !environment.production) {
      const p = document.createElement('canvas');
      p.width = 480;
      p.height = Math.round((480 * photo.height) / photo.width);
      p.getContext('2d')?.drawImage(photo, 0, 0, p.width, p.height);
      (window as unknown as { __dzStill?: unknown }).__dzStill = { size: [photo.width, photo.height], box: b, k, ox, oy, preview: p.toDataURL('image/jpeg', 0.7) };
    }
    photo.close();
    return crop;
  }

  private fail(text: string): void {
    this.errorText.set(text);
    this.phase.set('error');
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    const v = this.videoRef()?.nativeElement;
    if (v) v.srcObject = null;
  }

  private done(result: CameraResult | null): void {
    this.counting = false;
    this.stopStream();
    this.camera.finish(result);
  }
}
