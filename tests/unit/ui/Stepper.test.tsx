// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { Stepper, copy } from '../../../src/ui';

function Controlled() {
  const [value, setValue] = useState(2.5);
  return (
    <Stepper value={value} label={copy.weight} onChange={setValue} step={2.5} min={0} max={6} />
  );
}

it('clamps increments/decrements to min and max and disables boundary controls', async () => {
  const user = userEvent.setup();
  render(<Controlled />);
  const input = screen.getByRole('spinbutton') as HTMLInputElement;
  const down = screen.getByRole('button', { name: 'Decrease Weight' });
  const up = screen.getByRole('button', { name: 'Increase Weight' });
  await user.click(down);
  expect(input.valueAsNumber).toBe(0);
  expect((down as HTMLButtonElement).disabled).toBe(true);
  await user.click(up);
  await user.click(up);
  await user.click(up);
  expect(input.valueAsNumber).toBe(6);
  expect((up as HTMLButtonElement).disabled).toBe(true);
});

it('supports +/- and arrow keys and clamps typed input', () => {
  render(<Controlled />);
  const input = screen.getByRole('spinbutton') as HTMLInputElement;
  fireEvent.keyDown(input, { key: '+' });
  expect(input.valueAsNumber).toBe(5);
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input.valueAsNumber).toBe(6);
  fireEvent.keyDown(input, { key: '-' });
  expect(input.valueAsNumber).toBe(3.5);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(input.valueAsNumber).toBe(1);
  fireEvent.change(input, { target: { value: '999' } });
  expect(input.valueAsNumber).toBe(6);
  fireEvent.change(input, { target: { value: '-9' } });
  expect(input.valueAsNumber).toBe(0);
});

it('rounds decimal steps and ignores empty or disabled input', () => {
  const change = vi.fn();
  const view = render(<Stepper label={copy.weight} value={0.2} step={0.1} onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: 'Increase Weight' }));
  expect(change).toHaveBeenLastCalledWith(0.3);
  change.mockClear();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });
  expect(change).not.toHaveBeenCalled();
  view.rerender(<Stepper label={copy.weight} value={1} onChange={change} disabled />);
  fireEvent.keyDown(screen.getByRole('spinbutton'), { key: '+' });
  expect(change).not.toHaveBeenCalled();
});
