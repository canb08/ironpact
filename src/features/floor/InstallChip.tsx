import { useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { getInstallBrowser, isStandalone, subscribeInstall } from '../../platform/install.ts';
import { installDismissed } from '../auth/joinCode.ts';
import { copy } from '../../ui';

const DISMISSED = 'ironpact.today-install-dismissed';
function readDismissed() {
  try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; }
}

export function InstallChip() {
  const standalone = useSyncExternalStore(subscribeInstall, isStandalone, () => false);
  const [dismissed, setDismissed] = useState(readDismissed);
  if (standalone || getInstallBrowser() === 'other' || dismissed || !installDismissed()) return null;
  return <aside className="floor-install" aria-label={copy.x3Install}>
    <Link to="/install">{copy.x3Install}</Link>
    <button type="button" aria-label={copy.x3DismissInstall} onClick={() => {
      setDismissed(true);
      try { localStorage.setItem(DISMISSED, '1'); } catch { /* Dismiss for this visit. */ }
    }}><X size={20} aria-hidden="true" /></button>
  </aside>;
}
