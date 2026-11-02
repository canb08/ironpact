// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TrendChart } from '../../../../src/features/stats/TrendChart.tsx';
import { chartModel } from '../../../../src/features/stats/trend.ts';
import type { SessionBest } from '../../../../src/features/stats/trend.ts';

const window = { from: '2026-08-17', to: '2026-11-02' };

function point(sessionId: string, date: string, e1rm: number): SessionBest {
  return { sessionId, localDate: date, startedAt: `${date}T08:00:00.000Z`, e1rm };
}

it('draws a dashed partner line and keeps raw kg on the owner only', () => {
  const model = chartModel(
    [point('me-1', '2026-09-01', 60), point('me-2', '2026-10-06', 75)],
    [point('them-1', '2026-09-08', 140), point('them-2', '2026-10-13', 126)],
    true,
  );
  const { container } = render(
    <TrendChart
      model={model}
      window={window}
      youLabel="You"
      partnerLabel="Crewmate"
      partnerHue={220}
      caption="Both lines rebased"
    />,
  );
  const partnerLine = container.querySelector('.progress-line--partner');
  const labels = [...container.querySelectorAll('text, title')].map((node) => node.textContent).join(' ');
  expect(partnerLine?.getAttribute('stroke-dasharray')).toBe('5 4');
  expect(partnerLine?.getAttribute('points')?.split(' ').length).toBe(2);
  expect(screen.getByRole('img', { name: 'Both lines rebased' })).toBeTruthy();
  expect(labels).toContain('%');
  expect(labels).not.toContain('140');
  expect(labels).not.toContain('126');
  expect(labels).not.toContain('kg');
});
