// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { PlateLoader } from '../../../../src/features/session/PlateLoader.tsx';
import { DOCK_PLATES, sleevePlates } from '../../../../src/features/plate-calc/plateLoad.ts';
import { copy, fill } from '../../../../src/ui/copy.ts';
import * as feel from '../../../../src/ui/feel/feel.ts';

function Loader({ initial = 20, bar = 20, removing = false, available = DOCK_PLATES }: {
  initial?: number; bar?: number; removing?: boolean; available?: readonly number[];
}) {
  const [kg, setKg] = useState(initial);
  return <><output aria-label="total">{kg}</output><PlateLoader kg={kg} barKg={bar} available={available}
    disabled={false} removing={removing} onChange={setKg} /></>;
}

// jsdom has no PointerEvent; retain the mouse coordinates for hold cancellation.
vi.stubGlobal('PointerEvent', MouseEvent);

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('load the bar', () => {
  it('adds pairs on the configured bar and paints both sleeves, with one earned tick', () => {
    const pulse = vi.spyOn(feel, 'feel');
    render(<Loader initial={0} bar={15} />);
    fireEvent.click(screen.getByRole('button', { name: fill(copy.y3AddPair, { kg: 20 }) }));
    expect(screen.getByLabelText('total').textContent).toBe('55');
    expect(document.querySelectorAll('.session-mini-plate')).toHaveLength(2);
    expect(pulse).toHaveBeenCalledExactlyOnceWith('tick');
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('holds to remove exactly one pair without the following click re-adding it', () => {
    vi.useFakeTimers();
    render(<Loader initial={100} available={[20]} />);
    const plate = screen.getByRole('button', { name: fill(copy.y3AddPair, { kg: 20 }) });
    fireEvent.pointerDown(plate, { button: 0, pointerId: 1, clientX: 30, clientY: 40 });
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerUp(plate); fireEvent.click(plate);
    expect(screen.getByLabelText('total').textContent).toBe('60');
    fireEvent.keyDown(plate, { key: 'Delete' });
    expect(screen.getByLabelText('total').textContent).toBe('20');
    fireEvent.keyDown(plate, { key: 'Delete' });
    expect(screen.getByLabelText('total').textContent).toBe('20');
  });

  it('cancels a moving hold and supports an explicit removal mode', () => {
    vi.useFakeTimers();
    render(<Loader initial={70} removing />);
    const plate = screen.getByRole('button', { name: fill(copy.y3RemovePair, { kg: 25 }) });
    fireEvent.pointerDown(plate, { button: 0, clientX: 30, clientY: 40 });
    fireEvent.pointerMove(plate, { clientX: 70, clientY: 40 });
    act(() => vi.advanceTimersByTime(800)); fireEvent.pointerUp(plate); fireEvent.click(plate);
    expect(screen.getByLabelText('total').textContent).toBe('70');
    fireEvent.click(plate);
    expect(screen.getByLabelText('total').textContent).toBe('20');
  });

  it('does not exceed 500 kg or enable unavailable plates', () => {
    const pulse = vi.spyOn(feel, 'feel');
    render(<Loader initial={500} available={[25]} />);
    fireEvent.click(screen.getByRole('button', { name: fill(copy.y3AddPair, { kg: 25 }) }));
    expect(screen.getByLabelText('total').textContent).toBe('500');
    expect(pulse).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: fill(copy.y3AddPair, { kg: 20 }) }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('represents fractional plates and keeps odd loads unchanged', () => {
    expect(sleevePlates(82.5, 20, DOCK_PLATES)).toEqual([25, 5, 1.25]);
    expect(sleevePlates(-20, 20, DOCK_PLATES)).toEqual([]);
    expect(sleevePlates(80.25, 20, DOCK_PLATES)).toEqual([25, 5]);
  });
});
