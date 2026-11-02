// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { SegmentedControl } from '../../../src/ui/SegmentedControl';

const options = [
  { value: 'lifts', label: 'Lifts' }, { value: 'cardio', label: 'Cardio', disabled: true },
  { value: 'fight', label: 'Fight' }, { value: 'body', label: 'Body' },
];
function Controlled() {
  const [value, setValue] = useState('lifts');
  return <><SegmentedControl label="Progress" value={value} onChange={setValue} options={options} /><button>Next</button></>;
}

it('uses one tab stop, skips disabled choices, wraps and supports Home/End', async () => {
  const user = userEvent.setup();
  render(<Controlled />);
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Lifts' }));
  await user.keyboard('{ArrowRight}');
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Fight', checked: true }));
  await user.keyboard('{End}{ArrowRight}');
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Lifts', checked: true }));
  await user.keyboard('{ArrowLeft}');
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Body', checked: true }));
  await user.keyboard('{Home}');
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Lifts', checked: true }));
  await user.click(screen.getByRole('radio', { name: 'Fight' }));
  expect(screen.getByRole('radio', { name: 'Fight', checked: true }).tabIndex).toBe(0);
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
});

it('does not change a disabled control', async () => {
  const onChange = vi.fn();
  render(<SegmentedControl label="Progress" value="lifts" onChange={onChange} options={options} disabled />);
  await userEvent.click(screen.getByRole('radio', { name: 'Fight' }));
  expect(onChange).not.toHaveBeenCalled();
});
