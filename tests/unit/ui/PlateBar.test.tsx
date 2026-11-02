// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PlateBar } from '../../../src/ui/PlateBar';

it('announces each person and shows separate owner sides with empty capacity', () => {
  const { container } = render(<PlateBar members={[
    { name: 'You', credits: 2, target: 3 }, { name: 'Partner', credits: 1, target: 3 },
  ]} />);
  expect(screen.getByRole('img', { name: 'You 2 of 3, Partner 1 of 3' })).toBeTruthy();
  expect(container.querySelectorAll('[data-side="you"] [data-plate="full"]')).toHaveLength(2);
  expect(container.querySelectorAll('[data-side="partner"] [data-plate="full"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-plate="empty"]')).toHaveLength(3);
});

it('keeps two MINs distinct even when their combined credits make a whole session', () => {
  const { container } = render(<PlateBar members={[
    { name: 'You', credits: 2, minCount: 2, target: 3 },
    { name: 'Partner', credits: 1.5, minCount: 3, target: 3 },
  ]} />);
  expect(container.querySelectorAll('[data-side="you"] [data-plate="full"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-side="you"] [data-plate="min"]')).toHaveLength(2);
  expect(container.querySelectorAll('[data-side="partner"] [data-plate="min"]')).toHaveLength(3);
  expect(container.querySelector('[data-plate="min"]')?.getAttribute('height')).toBe('56');
  expect(container.querySelector('[data-plate="full"]')?.getAttribute('height')).toBe('88');
});

it('uses supplied display names and capitalised fallbacks for missing or blank names', () => {
  const view = render(<PlateBar members={[
    { credits: 2, target: 3 }, { name: '  ', credits: 1, target: 3 },
  ]} />);
  expect(screen.getByRole('img', { name: 'You 2 of 3, Partner 1 of 3' })).toBeTruthy();
  view.rerender(<PlateBar members={[
    { name: 'Lifter One', credits: 2, target: 3 }, { name: 'Lifter Two', credits: 1, target: 3 },
  ]} />);
  expect(screen.getByRole('img', { name: 'Lifter One 2 of 3, Lifter Two 1 of 3' })).toBeTruthy();
});

it('stacks plates outward from each collar, with matching empty slots', () => {
  const { container } = render(<PlateBar members={[
    { credits: 2, target: 3 }, { credits: 1, target: 3 },
  ]} />);
  for (const side of ['you', 'partner']) {
    const plates = [...container.querySelectorAll(`[data-side="${side}"] rect`)];
    const positions = plates.map((plate) => Number(plate.getAttribute('x')));
    expect(positions[0]).toBe(side === 'you' ? 123 : 206);
    expect(positions[1]! - positions[0]!).toBe(side === 'you' ? -17 : 17);
    for (const plate of plates) {
      expect(plate.getAttribute('width')).toBe('14');
      expect(plate.getAttribute('height')).toBe('88');
      expect(plate.getAttribute('rx')).toBe('3');
    }
  }
  expect(container.querySelectorAll('.ui-plate-bar__collar')).toHaveLength(2);
});

it('caps plates at capacity while keeping extra credits in the alternative', () => {
  const { container } = render(<PlateBar members={[
    { name: 'You', credits: 5, target: 3 }, { name: 'Partner', credits: 0, target: 3 },
  ]} />);
  expect(screen.getByRole('img', { name: 'You 5 of 3, Partner 0 of 3' })).toBeTruthy();
  expect(container.querySelectorAll('[data-side="you"] rect')).toHaveLength(3);
});
