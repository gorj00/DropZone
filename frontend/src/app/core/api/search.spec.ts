import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL, ApiService } from './api.service';

describe('search terms stay out of URLs', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return { api: TestBed.inject(ApiService), http: TestBed.inject(HttpTestingController) };
  }

  it('sends user search, the handle check and photo search as POST bodies', async () => {
    const { api, http } = setup();
    const users = api.searchUsers('mia tran');
    const users$ = http.expectOne(`${API_URL}/social/search`);
    expect(users$.request.method).toBe('POST');
    expect(users$.request.body).toEqual({ q: 'mia tran' });
    expect(users$.request.urlWithParams).toBe(`${API_URL}/social/search`);
    users$.flush([]);
    await users;

    const handle = api.handleAvailable('alex');
    const handle$ = http.expectOne(`${API_URL}/users/handle-available`);
    expect(handle$.request.method).toBe('POST');
    expect(handle$.request.body).toEqual({ handle: 'alex' });
    handle$.flush({ handle: 'alex', valid: true, available: true, message: null });
    await handle;

    const photos = api.searchPhotos('running shoes');
    const photos$ = http.expectOne(`${API_URL}/photos/search`);
    expect(photos$.request.method).toBe('POST');
    expect(photos$.request.body).toEqual({ q: 'running shoes' });
    expect(photos$.request.urlWithParams).not.toContain('running');
    photos$.flush([]);
    await photos;
    http.verify();
  });
});
