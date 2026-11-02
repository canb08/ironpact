import type { ReactElement } from 'react';
import { CHART_HEIGHT, CHART_WIDTH } from './trend.ts';

export function LineChart({
  caption,
  lines,
  youLabel,
  partnerLabel,
  partnerHue,
  compact = false,
}: {
  caption: string;
  lines: readonly { points: string; kind: 'you' | 'partner' | 'weight' }[];
  youLabel: string;
  partnerLabel: string | null;
  partnerHue: number;
  compact?: boolean;
}): ReactElement {
  const hue = Number.isFinite(partnerHue) ? ((Math.round(partnerHue) % 360) + 360) % 360 : 200;
  const partnerStroke = `hsl(${hue} 62% 58%)`;
  const drawn = lines.filter((line) => line.points.split(' ').filter(Boolean).length >= 2);
  return (
    <figure className="progress-chart">
      <svg
        className={compact ? 'progress-svg progress-svg--spark' : 'progress-svg'}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={caption}
      >
        <title>{caption}</title>
        {drawn.map((line) => (
          <polyline
            key={line.kind}
            className={line.kind === 'partner'
              ? 'progress-line progress-line--partner'
              : line.kind === 'weight'
                ? 'progress-line progress-line--weight'
                : 'progress-line progress-line--you'}
            fill="none"
            stroke={line.kind === 'partner' ? partnerStroke : undefined}
            strokeDasharray={line.kind === 'partner' ? '5 4' : undefined}
            points={line.points}
          />
        ))}
      </svg>
      <figcaption className="progress-legend">
        <span className="progress-swatch progress-swatch--you">{youLabel}</span>
        {partnerLabel != null && drawn.some((line) => line.kind === 'partner') && (
          <span className="progress-swatch progress-swatch--partner" style={{ color: partnerStroke }}>
            {partnerLabel}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
