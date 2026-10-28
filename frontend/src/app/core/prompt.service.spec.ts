import { PromptService } from './prompt.service';

describe('PromptService', () => {
  it('resolves a parsed number', async () => {
    const s = new PromptService();
    const p = s.number('Weight', 'kg');
    s.close('82,5');
    expect(await p).toBe(82.5);
    expect(s.current()).toBeNull();
  });

  it('resolves null on cancel or bad input', async () => {
    const s = new PromptService();
    const a = s.number('A');
    s.close(null);
    const b = s.number('B');
    s.close('abc');
    expect(await a).toBeNull();
    expect(await b).toBeNull();
  });

  it('resolves a confirmation', async () => {
    const s = new PromptService();
    const first = s.confirm('Count it?', 'msg');
    const second = s.confirm('Count it?', 'msg');
    s.answer(true);
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(s.confirmation()).toBeNull();
  });

  it('resolves the picked option and cancels an older choice', async () => {
    const s = new PromptService();
    const first = s.choose('Pick', [{ key: 'a', label: 'A' }]);
    const second = s.choose('Pick', [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
    s.pick('b');
    expect(await first).toBeNull();
    expect(await second).toBe('b');
    expect(s.choice()).toBeNull();
  });

  it('cancels a previous prompt when a new one opens', async () => {
    const s = new PromptService();
    const first = s.number('First');
    const second = s.number('Second');
    s.close('3');
    expect(await first).toBeNull();
    expect(await second).toBe(3);
  });
});
