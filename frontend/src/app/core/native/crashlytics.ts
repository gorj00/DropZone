import { EnvironmentProviders, ErrorHandler, Injectable, InjectionToken, computed, effect, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseCrashlytics, FirebaseCrashlyticsPlugin, StackFrame } from '@capacitor-firebase/crashlytics';
import { SessionStore } from '../session.store';

export interface CrashBridge {
  native: boolean;
  plugin: Pick<FirebaseCrashlyticsPlugin, 'recordException' | 'setUserId'>;
}

export const CRASHLYTICS = new InjectionToken<CrashBridge>('Crashlytics', {
  providedIn: 'root',
  factory: () => ({ native: Capacitor.isNativePlatform(), plugin: FirebaseCrashlytics })
});

const FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;

export function scrub(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/(\w+:\/\/[^\s?#)'"]+)[?#][^\s)'"]*/g, '$1');
}

export function stackFrames(stack: string | undefined): StackFrame[] {
  return (stack ?? '').split('\n').flatMap(line => {
    const m = FRAME.exec(line);
    if (!m) return [];
    const file = scrub(m[2]).split('/').pop() || m[2];
    return [{ functionName: m[1] ?? '(anonymous)', fileName: `${file}:${m[3]}:${m[4]}`, lineNumber: Number(m[3]) }];
  });
}

export function crashMessage(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  return scrub(text);
}

@Injectable({ providedIn: 'root' })
export class CrashReporter {
  private readonly bridge = inject(CRASHLYTICS);

  record(error: unknown): void {
    if (!this.bridge.native) return;
    const cause = (error as { rejection?: unknown } | null)?.rejection ?? error;
    const stacktrace = cause instanceof Error ? stackFrames(cause.stack) : [];
    void this.bridge.plugin.recordException({ message: crashMessage(cause), stacktrace }).catch(() => undefined);
  }

  setUser(id: string | null): void {
    if (!this.bridge.native) return;
    void this.bridge.plugin.setUserId({ userId: id ?? '' }).catch(() => undefined);
  }
}

@Injectable()
export class CrashlyticsErrorHandler extends ErrorHandler {
  private readonly reporter = inject(CrashReporter);

  override handleError(error: unknown): void {
    super.handleError(error);
    this.reporter.record(error);
  }
}

export function provideCrashReporting(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ErrorHandler, useClass: CrashlyticsErrorHandler },
    provideEnvironmentInitializer(() => {
      const reporter = inject(CrashReporter);
      const session = inject(SessionStore);
      const userId = computed(() => session.user()?.id ?? null);
      effect(() => reporter.setUser(userId()));
    })
  ]);
}
