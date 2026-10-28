import { TestBed } from '@angular/core/testing';
import { Avatar } from './bits';

describe('Avatar', () => {
  it('falls back to initials when the photo cannot load', () => {
    const fixture = TestBed.createComponent(Avatar);
    fixture.componentRef.setInput('url', 'https://lh3.googleusercontent.com/a/missing');
    fixture.componentRef.setInput('name', 'Jan Gorol');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent?.trim()).toBe('JG');

    fixture.componentRef.setInput('url', 'https://storage.googleapis.com/new.jpg');
    fixture.detectChanges();
    expect(el.querySelector('img')).not.toBeNull();
  });
});
