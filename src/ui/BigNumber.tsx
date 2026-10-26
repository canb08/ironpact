import type { HTMLAttributes, ReactNode } from 'react';

export type BigNumberProps = HTMLAttributes<HTMLSpanElement> & {
  value: string | number;
  unit?: ReactNode;
  size?: 'hero' | 'xl' | 'mega';
};

export function BigNumber({
  value,
  unit,
  size = 'hero',
  className = '',
  ...props
}: BigNumberProps) {
  return (
    <span {...props} className={`ui-number ui-number--${size} ${className}`}>
      {value}
      {unit && <span className="ui-number__unit">{unit}</span>}
    </span>
  );
}
