import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Analytics, DEVICE_KEY, failureDetail } from './analytics';
import { API_URL } from './api/api.service';

@Component({ template: '' })
class Blank {}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'welcome', component: Blank },
        { path: 'onboarding/:step', component: Blank },
        { path: 'today', component: Blank }
      ])
    ]
  });
  return { analytics: TestBed.inject(Analytics), http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router) };
}

const next = (http: HttpTestingController) => vi.waitFor(() => http.expectOne(`${API_URL}/events`));

describe('Analytics', () => {
  beforeEach(() => localStorage.clear());

  it('sends the app open with one device id that is kept for later events', async () => {
    const { analytics, http } = setup();
    analytics.start();
    const open = await next(http);
    expect(open.request.body).toEqual({ deviceId: expect.stringMatching(/^[0-9a-f-]{36}$/), name: 'APP_OPEN', detail: null, appVersion: null });
    open.flush(null);
    analytics.track('SIGN_IN_TAP', 'google');
    const tap = await next(http);
    expect(tap.request.body.deviceId).toBe(open.request.body.deviceId);
    expect(tap.request.body.detail).toBe('google');
    expect(localStorage.getItem(`CapacitorStorage.${DEVICE_KEY}`)).toBe(open.request.body.deviceId);
  });

  it('records the welcome screen and each onboarding step, nothing else', async () => {
    const { analytics, http, router } = setup();
    analytics.start();
    (await next(http)).flush(null);
    await router.navigateByUrl('/welcome?returnUrl=%2Ftoday');
    const welcome = await next(http);
    expect(welcome.request.body.name).toBe('WELCOME_VIEW');
    welcome.flush(null);
    await router.navigateByUrl('/today');
    await router.navigateByUrl('/onboarding/goal');
    const step = await next(http);
    expect(step.request.body).toMatchObject({ name: 'ONBOARDING_STEP', detail: 'goal' });
    step.flush(null);
    http.verify();
  });

  it('never throws when the event cannot be sent', async () => {
    const { analytics, http } = setup();
    analytics.track('SIGN_IN_FAIL', 'x'.repeat(400));
    const req = await next(http);
    expect(req.request.body.detail).toHaveLength(300);
    req.flush(null, { status: 0, statusText: 'Unknown Error' });
  });
});

describe('failureDetail', () => {
  it('names the provider, the error code and the message without e-mails', () => {
    const http = new HttpErrorResponse({ status: 401, error: { code: 'UNAUTHORIZED', message: 'Invalid Google token' } });
    expect(failureDetail('google', http)).toBe('google UNAUTHORIZED: Invalid Google token');
    expect(failureDetail('google', { code: 'DEVELOPER_ERROR', message: 'Wrong client for a@b.com' })).toBe('google DEVELOPER_ERROR: Wrong client for [email]');
    expect(failureDetail('apple', new Error('No ID token for a@b.com'))).toBe('apple Error: No ID token for [email]');
    expect(failureDetail('google', new HttpErrorResponse({ status: 0 }))).toBe('google NETWORK: No connection to the server.');
  });
});
