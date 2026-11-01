import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, Navigate } from 'react-router';
import { Button } from '../../ui/Button';
import { copy } from '../../ui/copy';
import {
  canPromptInstall, getInstallBrowser, isStandalone, promptInstall, subscribeInstall,
} from '../../platform/install';
import { persistStorageAfterInstall } from '../../platform/storage';

export default function InstallGate() {
  const standalone = useSyncExternalStore(subscribeInstall, isStandalone, () => false);
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const [promptUnavailable, setPromptUnavailable] = useState(false);
  const browser = getInstallBrowser();

  useEffect(() => {
    if (standalone) void persistStorageAfterInstall();
  }, [standalone]);

  if (standalone) return <Navigate to="/" replace />;

  const ios = browser === 'ios-safari';
  return (
    <main className="ui-gallery">
      <p>{copy.appName}</p>
      <h1>{copy.installTitle}</h1>
      <p>{copy.installIntro}</p>
      {browser === 'ios-other' ? <p>{copy.installOpenSafari}</p>
        : browser === 'other' ? <p>{copy.installOther}</p>
          : (
            <ol aria-label={ios ? copy.installSafari : copy.installAndroid}>
              <li>{ios ? copy.installIosShare : copy.installAndroidMenu}</li>
              <li>{ios ? copy.installIosAdd : copy.installAndroidAdd}</li>
              <li>{copy.installOpen}</li>
            </ol>
          )}
      {canPrompt && (
        <Button size="xl" onClick={() => {
          void promptInstall().then((outcome) => setPromptUnavailable(outcome === 'unavailable'));
        }}>
          {copy.installButton}
        </Button>
      )}
      {promptUnavailable && <p role="status">{copy.installPromptUnavailable}</p>}
      <p>{copy.openInstalled}</p>
      <Link className="ui-button ui-button--ghost" to="/" replace>{copy.installContinue}</Link>
    </main>
  );
}
