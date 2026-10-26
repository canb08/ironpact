import type { HTMLAttributes } from 'react';

export function Chip({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={`ui-chip ${className}`} />;
}
