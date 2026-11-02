// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrEventDraft } from '../../../../src/core/prs.ts';
import { PrCard } from '../../../../src/features/prs/PrCard.tsx';
import { copy } from '../../../../src/ui';

const event: PrEventDraft = {
  exercise_id: 'ex', source_id: 'set', pr_type: 'e1rm', reps: 5, value: 96.25, previous_value: 93.3,
  pct_over_previous: 3, display: 'takeover', user_id: 'u', local_date: '2026-11-02',
};

describe('static PR card', () => {
  afterEach(() => cleanup());

  it('shows the tier, the number and a 64px way back', async () => {
    const onClose = vi.fn();
    render(<PrCard event={event} onClose={onClose} />);
    const card = screen.getByRole('region', { name: copy.prCardLabel });
    expect(card.textContent).toContain(copy.prE1rm);
    expect(card.textContent).toContain('96.3');
    expect(card.textContent).toContain(copy.prDetail);
    const back = screen.getByRole('button', { name: copy.backToWork });
    expect(back.className).toContain('ui-button--xl');
    await userEvent.click(back);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
