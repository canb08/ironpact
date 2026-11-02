import type { HTMLAttributes } from 'react';

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'pr' | 'success';
};

export function Chip({ className = '', tone = 'neutral', ...props }: ChipProps) {
  return <span {...props} className={`ui-chip ui-chip--${tone} ${className}`} />;
}
