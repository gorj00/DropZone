import { ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { User } from '../api/models';
import { SessionStore } from '../session.store';
import { CRASHLYTICS, crashMessage, provideCrashReporting, stackFrames } from './crashlytics';

function setup(native: boolean) {
  const plugin = { recordException: vi.fn().mockResolvedValue(undefined), setUserId: vi.fn().mockResolvedValue(undefined) };
  const user = signal<User | null>(null);
  TestBed.configureTestingModule({
    providers: [provideCrashReporting(), { provide: CRASHLYTICS, useValue: { native, plugin } }, { provide: SessionStore, useValue: { user } }]
  });
  const handler = TestBed.inject(ErrorHandler);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return { handler, plugin, user };
}

const STACK = [
  'TypeError: x is undefined',
  '    at Today.load (https://localhost/main-ABC.js:1:2345)',
  '    at https://localhost/chunk-XYZ.js?v=2:3:40',
  '    at async Promise.all (index 0)'
].join('\n');

describe('stackFrames', () => {
  it('turns a WebView stack into frames without query strings', () => {
    expect(stackFrames(STACK)).toEqual([
      { functionName: 'Today.load', fileName: 'main-ABC.js:1:2345', lineNumber: 1 },
      { functionName: '(anonymous)', fileName: 'chunk-XYZ.js:3:40', lineNumber: 3 }
    ]);
    expect(stackFrames(undefined)).toEqual([]);
  });
});

describe('crashMessage', () => {
  it('drops e-mail addresses and query strings', () => {
    expect(crashMessage(new Error('No user jan@example.com at https://api.test/users?q=jan'))).toBe('Error: No user [email] at https://api.test/users');
    expect(crashMessage({ message: 'Http failure' })).toBe('Http failure');
    expect(crashMessage('plain')).toBe('plain');
  });
});

describe('CrashlyticsErrorHandler', () => {
  it('records uncaught errors as non-fatal on the device', () => {
    const { handler, plugin } = setup(true);
    const error = new TypeError('x is undefined');
    error.stack = STACK;
    handler.handleError(error);
    expect(plugin.recordException).toHaveBeenCalledWith({ message: 'TypeError: x is undefined', stacktrace: stackFrames(STACK) });
  });

  it('unwraps rejected promises', () => {
    const { handler, plugin } = setup(true);
    handler.handleError({ rejection: new Error('late') });
    expect(plugin.recordException).toHaveBeenCalledWith(expect.objectContaining({ message: 'Error: late' }));
  });

  it('does nothing on the web', () => {
    const { handler, plugin } = setup(false);
    handler.handleError(new Error('web'));
    TestBed.tick();
    expect(plugin.recordException).not.toHaveBeenCalled();
    expect(plugin.setUserId).not.toHaveBeenCalled();
  });

  it('tags reports with the user id only', () => {
    const { plugin, user } = setup(true);
    TestBed.tick();
    expect(plugin.setUserId).toHaveBeenLastCalledWith({ userId: '' });
    user.set({ id: 'u1', email: 'jan@example.com' } as User);
    TestBed.tick();
    expect(plugin.setUserId).toHaveBeenLastCalledWith({ userId: 'u1' });
    user.set(null);
    TestBed.tick();
    expect(plugin.setUserId).toHaveBeenLastCalledWith({ userId: '' });
  });
});
