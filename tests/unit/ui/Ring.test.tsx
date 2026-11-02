// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Ring, type RingMember } from '../../../src/ui/Ring';
import { copy } from '../../../src/ui/copy';

function member(partial: Partial<RingMember> & Pick<RingMember, 'id' | 'credits'>): RingMember {
  return {
    name: partial.id,
    initial: partial.id.slice(0, 1).toUpperCase(),
    color: '#C6FF00',
    target: 3,
    minCount: 0,
    ...partial,
  };
}

type Segment = {
  member: string;
  index: number;
  start: number;
  sweep: number;
  gap: number;
  state: string;
  width: number;
  pattern: string;
};

function segments(container: HTMLElement): Segment[] {
  return [...container.querySelectorAll<SVGPathElement>('[data-segment]')].map((node) => ({
    member: node.getAttribute('data-member') ?? '',
    index: Number(node.getAttribute('data-index')),
    start: Number(node.getAttribute('data-start')),
    sweep: Number(node.getAttribute('data-sweep')),
    gap: Number(node.getAttribute('data-gap')),
    state: node.getAttribute('data-state') ?? '',
    width: Number(node.getAttribute('stroke-width')),
    pattern: node.getAttribute('data-pattern') ?? '',
  }));
}

/** One block: each next segment starts one gap after the previous one ends. */
function contiguous(arcs: readonly Segment[]): boolean {
  const ordered = [...arcs].sort((a, b) => a.start - b.start);
  return ordered.every((arc, index) => {
    const previous = ordered[index - 1];
    if (!previous) return true;
    return Math.abs(arc.start - (previous.start + previous.sweep + previous.gap)) < 0.02;
  });
}

describe('Ring', () => {
  it('draws one member across their target, as one arc', () => {
    const { container } = render(<Ring members={[member({ id: 'you', name: 'You', credits: 2 })]} />);
    const arcs = segments(container);
    expect(arcs).toHaveLength(3);
    expect(arcs.every((arc) => arc.member === 'you')).toBe(true);
    expect(contiguous(arcs)).toBe(true);
    expect(arcs.every((arc) => arc.gap === 6)).toBe(true);
    expect(screen.getByRole('img', { name: 'Week: 2 of 3 sessions. 2 of 3' })).toBeTruthy();
  });

  it('splits two members into contiguous arcs and hatches the second', () => {
    const { container } = render(
      <Ring
        members={[
          member({ id: 'you', name: 'You', credits: 2 }),
          member({ id: 'partner', name: 'partner', color: '#00D1FF', credits: 1 }),
        ]}
      />,
    );
    const arcs = segments(container);
    expect(arcs).toHaveLength(6);
    const yours = arcs.filter((arc) => arc.member === 'you');
    const partner = arcs.filter((arc) => arc.member === 'partner');
    expect(contiguous(yours)).toBe(true);
    expect(contiguous(partner)).toBe(true);
    expect(Math.max(...yours.map((arc) => arc.start))).toBeLessThan(Math.min(...partner.map((arc) => arc.start)));
    const yourFirst = yours.find((arc) => arc.index === 0);
    const partnerFirst = partner.find((arc) => arc.index === 0);
    expect(yourFirst && yourFirst.start).toBeLessThan(90);
    expect(partnerFirst && partnerFirst.start).toBeGreaterThan(180);
    expect(partner.filter((arc) => arc.state !== 'empty').every((arc) => arc.pattern === 'hatch')).toBe(true);
    expect(yours.filter((arc) => arc.state !== 'empty').every((arc) => arc.pattern === 'solid')).toBe(true);
    expect(
      screen.getByRole('img', { name: 'Week: 3 of 6 sessions. 2 of 3 · partner 1 of 3' }),
    ).toBeTruthy();
    expect(screen.getByRole('img', { name: /2 of 3 · partner 1 of 3/ })).toBeTruthy();
  });

  it('gives three members capacity members × target, each on one arc', () => {
    const { container } = render(
      <Ring
        size="coop"
        members={[
          member({ id: 'you', credits: 1 }),
          member({ id: 'partner', name: 'partner', credits: 1 }),
          member({ id: 'third', name: 'third', credits: 3 }),
        ]}
      />,
    );
    const arcs = segments(container);
    expect(arcs).toHaveLength(9);
    for (const id of ['you', 'partner', 'third']) {
      expect(contiguous(arcs.filter((arc) => arc.member === id))).toBe(true);
    }
    const order = [...arcs].sort((a, b) => a.start - b.start).map((arc) => arc.member);
    const blocks = order.filter((id, index) => order[index - 1] !== id);
    expect(blocks).toEqual(['you', 'partner', 'third']);
    expect(arcs.find((arc) => arc.member === 'third' && arc.state === 'full')?.pattern).toBe('dots');
    expect(screen.getByRole('img', { name: /1 of 3 · partner 1 of 3 · third 3 of 3/ })).toBeTruthy();
  });

  it('draws a MIN at half the full stroke on personal and co-op rings', () => {
    const personal = render(<Ring members={[member({ id: 'you', credits: 1.5, minCount: 1 })]} />);
    const personalArcs = segments(personal.container);
    const personalFull = personalArcs.find((arc) => arc.state === 'full');
    const personalMin = personalArcs.find((arc) => arc.state === 'min');
    expect(personalFull?.width).toBe(14);
    expect(personalMin?.width).toBe(7);
    expect(personalMin && personalFull && personalMin.width * 2).toBe(personalFull?.width);
    expect(screen.getByRole('img', { name: 'Week: 1.5 of 3 sessions. 1.5 of 3, 1 MIN' })).toBeTruthy();
    personal.unmount();

    const coop = render(<Ring size="coop" members={[member({ id: 'you', credits: 0.5, minCount: 1 })]} />);
    const coopArcs = segments(coop.container);
    expect(coopArcs.find((arc) => arc.state === 'min')?.width).toBe(9);
    expect(coopArcs.find((arc) => arc.state === 'empty')?.width).toBe(18);
  });

  it('fills a new MIN segment and says the MIN day line', async () => {
    const view = render(<Ring announceMin members={[member({ id: 'you', credits: 0 })]} />);
    view.rerender(<Ring announceMin members={[member({ id: 'you', credits: 0.5, minCount: 1 })]} />);
    await waitFor(() => expect(view.container.querySelector('[data-filling="1"]')).toBeTruthy());
    expect(view.container.querySelector('[data-state="min"]')).toBeTruthy();
    expect(view.container.querySelector('[data-puff]')).toBeTruthy();
    expect(view.container.querySelector('canvas')).toBeNull();
    expect(screen.getByTestId('min-moment').textContent).toBe(copy.minLogged);
  });

  it('reduced motion is a static ring with no canvas and no chalk', () => {
    const { container } = render(
      <Ring
        reduced
        closing
        members={[
          member({ id: 'you', name: 'You', credits: 3 }),
          member({ id: 'partner', name: 'partner', credits: 3 }),
        ]}
      />,
    );
    expect(container.querySelector('[data-motion="static"]')).toBeTruthy();
    expect(container.querySelector('[data-puff]')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByText(copy.ringClosedCentre)).toBeTruthy();
    expect(container.querySelector('.ring-spin')).toBeNull();
  });
});
