import { useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { isStandalone, subscribeInstall } from '../../platform/install.ts';
import { installDismissed } from '../auth/joinCode.ts';
import { Chip, copy } from '../../ui';

/** Floor row 1. Stays up after Skip until the app is actually installed. */
export function InstallChip() {
  const standalone = useSyncExternalStore(subscribeInstall, isStandalone, () => false);
  if (standalone || !installDismissed()) return null;
  return (
    <Link className="floor-install" to="/install">
      <Chip>{copy.install}</Chip>
    </Link>
  );
}
