// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrubDial } from '../../../src/ui/ScrubDial';

const feel = vi.hoisted(() => vi.fn());

vi.mock('../../../src/ui/feel/feel', () => ({
  feel,
}));

afterEach(() => {
  feel.mockClear();
  vi.restoreAllMocks();
});

function Harness({ onTap, value = 80 }: { onTap?: () => void; value?: number }) {
  const [current, setCurrent] = useState(value);
  return (
    <ScrubDial
      label="Weight"
      value={current}
      onChange={setCurrent}
      min={0}
      max={200}
      step={2.5}
      unit="kg"
      onTapNumber={onTap}
    />
  );
}

function slider() {
  return render(<Harness />).getByRole('slider', { name: 'Weight' });
}

describe('ScrubDial', () => {
  it('exposes slider values and steps from the keyboard', () => {
    const node = slider();
    expect(node.getAttribute('aria-valuenow')).toBe('80');
    expect(node.getAttribute('aria-valuemin')).toBe('0');
    expect(node.getAttribute('aria-valuemax')).toBe('200');
    expect(node.getAttribute('aria-valuetext')).toBe('80 kg');
    expect(node.getAttribute('aria-orientation')).toBe('vertical');

    fireEvent.keyDown(node, { key: 'ArrowUp' });
    expect(node.getAttribute('aria-valuenow')).toBe('82.5');
    expect(node.textContent).toContain('82.5');
    expect(feel).toHaveBeenCalledTimes(1);
    expect(feel).toHaveBeenCalledWith('tick');

    feel.mockClear();
    fireEvent.keyDown(node, { key: 'ArrowDown' });
    expect(node.getAttribute('aria-valuenow')).toBe('80');

    feel.mockClear();
    fireEvent.keyDown(node, { key: 'PageUp' });
    expect(node.getAttribute('aria-valuenow')).toBe('105');
    expect(feel).toHaveBeenCalledTimes(10);

    feel.mockClear();
    fireEvent.keyDown(node, { key: 'PageDown' });
    expect(node.getAttribute('aria-valuenow')).toBe('80');
    expect(feel).toHaveBeenCalledTimes(10);
  });

  it('moves one detent per slow drag and more when the flick is fast', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const node = slider();
    fireEvent.pointerDown(node, { pointerId: 1, button: 0, clientY: 200 });
    now = 1200;
    fireEvent.pointerMove(node, { pointerId: 1, clientY: 182 });
    expect(node.getAttribute('aria-valuenow')).toBe('82.5');
    expect(feel).toHaveBeenCalledTimes(1);

    cleanup();
    feel.mockClear();
    now = 2000;
    const flicked = slider();
    fireEvent.pointerDown(flicked, { pointerId: 1, button: 0, clientY: 200 });
    now = 2010;
    fireEvent.pointerMove(flicked, { pointerId: 1, clientY: 182 });
    expect(flicked.getAttribute('aria-valuenow')).toBe('90');
    expect(feel).toHaveBeenCalledTimes(4);
  });

  it('calls onTapNumber only when the pointer did not cross a detent', () => {
    const onTap = vi.fn();
    const view = render(<Harness onTap={onTap} />);
    const node = view.getByRole('slider');
    fireEvent.pointerDown(node, { pointerId: 1, button: 0, clientY: 200, timeStamp: 1000 });
    fireEvent.pointerUp(node, { pointerId: 1, clientY: 203, timeStamp: 1100 });
    expect(onTap).toHaveBeenCalledTimes(1);

    onTap.mockClear();
    fireEvent.pointerDown(node, { pointerId: 1, button: 0, clientY: 200, timeStamp: 2000 });
    fireEvent.pointerMove(node, { pointerId: 1, clientY: 182, timeStamp: 2200 });
    fireEvent.pointerUp(node, { pointerId: 1, clientY: 182, timeStamp: 2300 });
    expect(onTap).not.toHaveBeenCalled();
  });
});
