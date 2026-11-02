import type { ReactElement } from 'react';
import { CHART_HEIGHT, CHART_WIDTH, formatTrendNumber } from './trend.ts';

export function LineChart({
  caption,
  lines,
  youLabel,
  partnerLabel,
  compact = false,
  scale,
}: {
  caption: string;
  lines: readonly { points: string; kind: 'you' | 'partner' | 'weight' }[];
  youLabel: string;
  partnerLabel: string | null;
  partnerHue: number;
  compact?: boolean;
  scale?: { min: number; max: number; unit: string };
}): ReactElement {
  const partnerStroke = 'var(--plate-blue)';
  const drawn = lines.filter((line) => line.points.trim().length > 0);
  return (
    <figure className="progress-chart">
      <svg
        className={compact ? 'progress-svg progress-svg--spark' : 'progress-svg'}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio={compact ? 'none' : undefined}
        role="img"
        aria-label={caption}
      >
        <title>{caption}</title>
        {!compact && scale && Number.isFinite(scale.min) && <>
          <text className="progress-axis" x="28" y="14">{formatTrendNumber(scale.max)} {scale.unit}</text>
          <text className="progress-axis" x="28" y={CHART_HEIGHT - 5}>{formatTrendNumber(scale.min)}</text>
        </>}
        {drawn.map((line) => <polyline key={`outline-${line.kind}`} aria-hidden="true" className="progress-line-outline" fill="none"
          strokeDasharray={line.kind === 'partner' ? '5 4' : undefined} points={line.points} />)}
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
        {drawn.map((line) => line.points.trim().split(' ').map((pair, index) => {
          const [x, y] = pair.split(',');
          return <circle key={`${line.kind}-${index}`} cx={x} cy={y} r="3" className={`progress-dot--${line.kind}`} />;
        }))}
      </svg>
      <figcaption className="progress-legend">
        <span className="progress-chart-caption">{caption}</span>
        <span className="progress-swatch progress-swatch--you">{youLabel}</span>
        {partnerLabel != null && drawn.some((line) => line.kind === 'partner') && (
          <span className="progress-swatch progress-swatch--partner" >
            {partnerLabel}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
