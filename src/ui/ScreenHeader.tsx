import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from './Button';
import { copy } from './copy';

export interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  trailing?: ReactNode;
}

export function ScreenHeader({ title, onBack, backLabel = copy.x1Back, trailing }: ScreenHeaderProps) {
  return <header className="ui-screen-header">
    {onBack && <Button variant="quiet" aria-label={backLabel} onClick={onBack}>
      <ChevronLeft size={24} aria-hidden="true" />
    </Button>}
    <h1>{title}</h1>
    {trailing && <div className="ui-screen-header__trailing">{trailing}</div>}
  </header>;
}
