import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { People } from '../../core/api/models';
import { proofLink } from '../../core/native/share';
import { PromptService } from '../../core/prompt.service';
import { PeopleRow } from './people-row';

function render(people: People | null, pro: boolean): string {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([])] });
  const f = TestBed.createComponent(PeopleRow);
  f.componentRef.setInput('people', people);
  f.componentRef.setInput('text', 'hyped your drop');
  f.componentRef.setInput('pro', pro);
  f.detectChanges();
  return (f.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

const user = (name: string) => ({ id: name, displayName: name, handle: name.toLowerCase(), avatarUrl: null, path: 'LOSE' as const });

describe('PeopleRow', () => {
  it('names the first two people and counts the rest', () => {
    expect(render({ count: 5, users: [user('Mia Tran'), user('Tom'), user('Nina')] }, true)).toContain('Mia, Tom +3');
  });

  it('hides when nobody is there', () => {
    expect(render({ count: 0, users: [] }, true)).toBe('');
  });

  it('shows a PRO teaser for free users', () => {
    expect(render(null, false)).toContain('Your community');
  });

  it('opens the report and block sheet from a face', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([])] });
    const f = TestBed.createComponent(PeopleRow);
    f.componentRef.setInput('people', { count: 1, users: [user('Mia')] });
    f.componentRef.setInput('text', 'hyped your drop');
    f.componentRef.setInput('pro', true);
    f.detectChanges();
    const el = (f.nativeElement as HTMLElement).querySelector('button[aria-label="Mia"]') as HTMLButtonElement;
    el.click();
    const prompt = TestBed.inject(PromptService);
    expect(prompt.choice()?.title).toBe('Mia');
    prompt.pick(null);
  });
});

describe('proofLink', () => {
  it('points at the proof on the app domain', () => {
    expect(proofLink('abc')).toBe('https://dropzone.app/p/abc');
  });
});
