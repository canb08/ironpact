// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrEventDraft } from '../../../../src/core/prs.ts';
import { PrCard } from '../../../../src/features/prs/PrCard.tsx';
import { copy } from '../../../../src/ui';
import { MotionReducedContext } from '../../../../src/ui/motion/reduced-context.ts';

const event: PrEventDraft = {
  exercise_id: 'ex', source_id: 'set', pr_type: 'e1rm', reps: 5, value: 96.25, previous_value: 93.3,
  pct_over_previous: 3, display: 'takeover', user_id: 'u', local_date: '2026-11-02',
};

describe('static PR card', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the tier, the number and a 64px way back when motion is reduced', async () => {
    const onClose = vi.fn();
    render(
      <MotionReducedContext.Provider value={true}>
        <PrCard event={event} onClose={onClose} />
      </MotionReducedContext.Provider>,
    );
    const card = screen.getByRole('region', { name: copy.prCardLabel });
    expect(card.getAttribute('data-motion')).toBe('static');
    expect(card.textContent).toContain(copy.prE1rm);
    expect(card.textContent).toContain('96.3');
    expect(card.textContent).toContain(copy.prDetail);
    expect(document.querySelector('canvas')).toBeNull();
    const back = screen.getByRole('button', { name: copy.backToWork });
    expect(back.className).toContain('ui-button--xl');
    await userEvent.click(back);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('follows the OS reduced-motion query with no canvas', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: String(query).includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    })));
    render(<PrCard event={event} onClose={() => {}} />);
    expect(screen.getByRole('region', { name: copy.prCardLabel }).getAttribute('data-motion')).toBe('static');
    expect(document.querySelector('canvas')).toBeNull();
    expect(screen.queryByRole('button', { name: copy.sharePr })).toBeNull();
  });
});
