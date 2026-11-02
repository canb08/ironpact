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

it('keeps two MINs thin even when their combined credits make a whole session', () => {
  const { container } = render(<PlateBar members={[
    { name: 'You', credits: 2, minCount: 2, target: 3 },
    { name: 'Partner', credits: 1.5, minCount: 3, target: 3 },
  ]} />);
  expect(container.querySelectorAll('[data-side="you"] [data-plate="full"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-side="you"] [data-plate="min"]')).toHaveLength(2);
  expect(container.querySelectorAll('[data-side="partner"] [data-plate="min"]')).toHaveLength(3);
  expect(container.querySelector('[data-plate="min"]')?.getAttribute('width')).toBe('4');
  expect(container.querySelector('[data-plate="full"]')?.getAttribute('width')).toBe('8');
});

it('caps plates at capacity while keeping extra credits in the alternative', () => {
  const { container } = render(<PlateBar members={[
    { name: 'You', credits: 5, target: 3 }, { name: 'Partner', credits: 0, target: 3 },
  ]} />);
  expect(screen.getByRole('img', { name: 'You 5 of 3, Partner 0 of 3' })).toBeTruthy();
  expect(container.querySelectorAll('[data-side="you"] rect')).toHaveLength(3);
});
