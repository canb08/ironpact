import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export interface ListRowProps {
  title: string;
  detail?: string;
  trailing?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function ListRow({
  title, detail, trailing, chevron = false, onClick, disabled, className = '',
}: ListRowProps) {
  const content = <>
    <span className="ui-list-row__body">
      <span className="ui-list-row__title">{title}</span>
      {detail && <span className="ui-list-row__detail">{detail}</span>}
    </span>
    {trailing != null && <span className="ui-list-row__trailing">{trailing}</span>}
    {chevron && <ChevronRight size={20} aria-hidden="true" className="ui-list-row__chevron" />}
  </>;
  const classes = `ui-list-row ${className}`;
  return onClick
    ? <button type="button" className={classes} disabled={disabled} onClick={onClick}>{content}</button>
    : <div className={classes}>{content}</div>;
}
