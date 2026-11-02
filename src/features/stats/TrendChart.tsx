import type { ReactElement } from 'react';
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  chartGeometry,
  formatTrendNumber,
  polylinePoints,
  type ChartModel,
  type TrendWindow,
} from './trend.ts';

export function TrendChart({
  model,
  window,
  youLabel,
  partnerLabel,
  caption,
}: {
  model: ChartModel;
  window: TrendWindow;
  youLabel: string;
  partnerLabel: string | null;
  partnerHue: number;
  caption: string;
}): ReactElement {
  const geometry = chartGeometry(model, window);
  const unit = model.mode === 'percent' ? '%' : 'kg';
  const partnerStroke = 'var(--plate-blue)';
  return (
    <figure className="progress-chart">
      <svg
        className="progress-svg"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={caption}
      >
        <title>{caption}</title>
        <line
          className="progress-axis-line"
          x1="28"
          y1={CHART_HEIGHT - 20}
          x2={CHART_WIDTH - 28}
          y2={CHART_HEIGHT - 20}
        />
        <text className="progress-axis" x="28" y="14">
          {formatTrendNumber(geometry.yMax)} {unit}
        </text>
        <text className="progress-axis" x="28" y={CHART_HEIGHT - 6}>
          {formatTrendNumber(geometry.yMin)}
        </text>
        <polyline aria-hidden="true" className="progress-line-outline" fill="none" points={polylinePoints(geometry.mine)} />
        <polyline
          className="progress-line progress-line--you"
          fill="none"
          points={polylinePoints(geometry.mine)}
        />
        {geometry.mine.map((point) => (
          <circle key={point.sessionId} className="progress-dot progress-dot--you" cx={point.x} cy={point.y} r="3" />
        ))}
        {geometry.partner.length > 0 && <polyline aria-hidden="true" className="progress-line-outline" fill="none" strokeDasharray="5 4" points={polylinePoints(geometry.partner)} />}
        {geometry.partner.length > 0 && (
          <polyline
            className="progress-line progress-line--partner"
            fill="none"
            stroke={partnerStroke}
            strokeDasharray="5 4"
            points={polylinePoints(geometry.partner)}
          />
        )}
        {geometry.partner.map((point) => (
          <circle
            key={point.sessionId}
            className="progress-dot progress-dot--partner"
            cx={point.x}
            cy={point.y}
            r="3"
            fill={partnerStroke}
          />
        ))}
      </svg>
      <figcaption className="progress-legend">
        <span className="progress-chart-caption">{caption}</span>
        <span className="progress-swatch progress-swatch--you">{youLabel}</span>
        {partnerLabel != null && geometry.partner.length > 0 && (
          <span className="progress-swatch progress-swatch--partner" >
            {partnerLabel}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
