// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { consumeSelectedPhoto } from './photoSelection.ts';

function selection() {
  const input = document.createElement('input');
  input.type = 'file';
  const file = new File(['photo bytes'], 'proof.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file] });
  const reset = vi.spyOn(input, 'value', 'set');
  return { input, file, reset };
}

describe('photo input lifetime', () => {
  it('keeps the selection through async card creation and image reading, then permits reselection', async () => {
    const { input, file, reset } = selection();
    let complete: (() => void) | undefined;
    const reading = new Promise<void>((resolve) => { complete = resolve; });
    const consume = vi.fn(async (selected: File) => {
      await Promise.resolve(); // Card creation precedes the image reader.
      expect(reset).not.toHaveBeenCalled();
      expect(selected).toBe(file);
      await reading;
      expect(reset).not.toHaveBeenCalled();
    });
    const pending = consumeSelectedPhoto(input, consume);
    expect(consume).toHaveBeenCalledWith(file);
    expect(reset).not.toHaveBeenCalled();
    complete?.();
    await pending;
    expect(reset).toHaveBeenCalledExactlyOnceWith('');
  });

  it('resets after a failed reader so choosing the same photo can retry', async () => {
    const { input, reset } = selection();
    await expect(consumeSelectedPhoto(input, async () => { throw new Error('decode'); })).rejects.toThrow('decode');
    expect(reset).toHaveBeenCalledExactlyOnceWith('');
  });

  it('leaves a cancelled chooser alone', async () => {
    const input = document.createElement('input'); input.type = 'file';
    const consume = vi.fn();
    await consumeSelectedPhoto(input, consume);
    expect(consume).not.toHaveBeenCalled();
  });
});
