import { HttpErrorResponse } from '@angular/common/http';
import { searchError } from './reward-photo-picker';

describe('photo search errors', () => {
  it('shows the server message when the search is rate limited', () => {
    const e = new HttpErrorResponse({ status: 429, error: { status: 429, code: 'RATE_LIMITED', message: 'Slow down a little — try again in a few minutes.' } });
    expect(searchError(e)).toEqual({ text: 'Slow down a little — try again in a few minutes.', retry: true });
  });

  it('keeps the Unsplash quota message', () => {
    const e = new HttpErrorResponse({ status: 429, error: { code: 'PHOTO_SEARCH_LIMIT', message: 'Photo search is busy. Try again in an hour.' } });
    expect(searchError(e).text).toBe('Photo search is busy. Try again in an hour.');
  });
});
