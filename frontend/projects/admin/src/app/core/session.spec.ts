import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from './api';
import { Session, TOKEN_KEY } from './session';
import type { User } from './models';

const admin = { id: 'u1', email: 'os.jangorol@gmail.com', admin: true } as unknown as User;
const plain = { id: 'u2', email: 'someone@example.com', admin: false } as unknown as User;

function setup(me: () => Promise<{ user: User; token: string | null }>): Session {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiService, useValue: { me } }] });
  return TestBed.inject(Session);
}

describe('Session', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a stored token when the account is an admin', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok');
    const session = setup(() => Promise.resolve({ user: admin, token: 'fresh' }));
    await session.init();
    expect(session.loggedIn()).toBe(true);
    expect(session.token()).toBe('fresh');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('fresh');
  });

  it('drops the token when the account is not an admin or the token is rejected', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok');
    const session = setup(() => Promise.resolve({ user: plain, token: null }));
    await session.init();
    expect(session.loggedIn()).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();

    localStorage.setItem(TOKEN_KEY, 'tok2');
    const rejected = setup(() => Promise.reject(new HttpErrorResponse({ status: 401 })));
    await rejected.init();
    expect(rejected.token()).toBeNull();
  });

  it('keeps the token while the server is unreachable and refuses non-admins at sign-in', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok');
    const session = setup(() => Promise.reject(new HttpErrorResponse({ status: 0 })));
    await session.init();
    expect(session.token()).toBe('tok');
    expect(session.loggedIn()).toBe(false);
    expect(() => session.signIn('x', plain)).toThrow();
    session.signIn('y', admin);
    expect(session.loggedIn()).toBe(true);
  });
});
