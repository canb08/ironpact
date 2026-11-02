// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { FairList } from '../../../../src/features/duo/FairList.tsx';
import { copy } from '../../../../src/ui/copy.ts';

const ready = (current: number, percent: number) => ({
  state: 'ready' as const,
  baseline: 80,
  current,
  percent,
});

it('shows relative percents and only one raw kg at a time', () => {
  render(<FairList rows={[
    { id: 'a', name: 'Athlete', fair: ready(100, 25) },
    { id: 'b', name: 'Crewmate', fair: ready(60, 10) },
  ]} />);
  expect(screen.getByText(/\+25%/)).toBeTruthy();
  expect(screen.getByText(/\+10%/)).toBeTruthy();
  expect(screen.queryByText('100 kg')).toBeNull();
  expect(screen.queryByText('60 kg')).toBeNull();
  const buttons = screen.getAllByRole('button', { name: copy.showRawKg });
  fireEvent.click(buttons[0]!);
  expect(screen.getByText('100 kg')).toBeTruthy();
  expect(screen.queryByText('60 kg')).toBeNull();
  fireEvent.click(buttons[1]!);
  expect(screen.queryByText('100 kg')).toBeNull();
  expect(screen.getByText('60 kg')).toBeTruthy();
});
