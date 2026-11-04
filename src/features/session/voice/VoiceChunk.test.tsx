// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VoiceInput } from './VoiceInput.tsx';
import { copy } from '../../../ui/copy.ts';

vi.mock('./VoiceMic.tsx', () => { throw new Error('Optional chunk is offline'); });
afterEach(() => vi.unstubAllGlobals());

it('keeps the confirmation form usable when the lazy mic chunk cannot load', async () => {
  vi.stubGlobal('SpeechRecognition', class {});
  const confirm = vi.fn((event) => event.preventDefault());
  await act(async () => {
    render(<form onSubmit={confirm}>
      <VoiceInput kg={80} reps={5} same={{ kg: 80, reps: 5 }} minKg={0} maxKg={500}
        disabled={false} reduced onDraft={vi.fn()} />
      <button type="submit">{copy.x4Log}</button>
    </form>);
  });
  expect(screen.queryByRole('button', { name: copy.y7Hold })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: copy.x4Log }));
  expect(confirm).toHaveBeenCalledOnce();
});
