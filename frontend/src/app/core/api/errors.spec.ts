import { HttpErrorResponse } from '@angular/common/http';
import { apiError, isProRequired } from './errors';

describe('apiError', () => {
  it('uses the code and message from an API error body', () => {
    const e = new HttpErrorResponse({ status: 400, error: { code: 'VALIDATION', message: 'Too long' } });
    expect(apiError(e)).toEqual({ status: 400, code: 'VALIDATION', message: 'Too long' });
  });

  it('maps a request that never reached the server to NETWORK', () => {
    const e = new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') });
    expect(apiError(e)).toEqual({ status: 0, code: 'NETWORK', message: 'No connection to the server.' });
  });

  it('falls back to the HTTP status when the body has no code', () => {
    const e = new HttpErrorResponse({ status: 503, statusText: 'Unavailable', url: 'https://api.test/x', error: 'down' });
    const err = apiError(e);
    expect(err.status).toBe(503);
    expect(err.code).toBe('503');
    expect(err.message).toContain('503');
  });

  it('keeps an empty message when the body has a code but no message', () => {
    const e = new HttpErrorResponse({ status: 409, error: { code: 'CONFLICT' } });
    expect(apiError(e)).toEqual({ status: 409, code: 'CONFLICT', message: '' });
  });

  it('wraps non-HTTP errors as UNKNOWN', () => {
    expect(apiError(new Error('Boom'))).toEqual({ status: -1, code: 'UNKNOWN', message: 'Boom' });
    expect(apiError('nope')).toEqual({ status: -1, code: 'UNKNOWN', message: 'Something went wrong.' });
  });

  it('detects PRO_REQUIRED', () => {
    expect(isProRequired(new HttpErrorResponse({ status: 403, error: { code: 'PRO_REQUIRED', message: 'PRO' } }))).toBe(true);
    expect(isProRequired(new HttpErrorResponse({ status: 403, error: { code: 'FORBIDDEN', message: 'No' } }))).toBe(false);
  });
});
