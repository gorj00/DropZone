import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ApiService } from './api/api.service';
import { AvatarService } from './avatar.service';
import { PromptService } from './prompt.service';
import { SessionStore } from './session.store';

describe('AvatarService', () => {
  let update: ReturnType<typeof vi.fn>;
  let prompt: PromptService;
  let service: AvatarService;

  beforeEach(() => {
    update = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: {} },
        { provide: SessionStore, useValue: { user: signal({ avatarUrl: 'https://storage.test/uploads/u/a.jpg' }), update } }
      ]
    });
    prompt = TestBed.inject(PromptService);
    service = TestBed.inject(AvatarService);
  });

  const tick = () => new Promise(r => setTimeout(r));

  it('offers removing the photo and asks before removing it', async () => {
    const done = service.change();
    expect(prompt.choice()?.options.map(o => o.key)).toContain('remove');
    prompt.pick('remove');
    await tick();
    expect(prompt.confirmation()?.title).toBe('Remove profile photo?');
    prompt.answer(true);
    await done;
    expect(update).toHaveBeenCalledWith({ avatarUrl: '' });
  });

  it('keeps the photo when removal is cancelled', async () => {
    const done = service.change();
    prompt.pick('remove');
    await tick();
    prompt.answer(false);
    await done;
    expect(update).not.toHaveBeenCalled();
  });
});
