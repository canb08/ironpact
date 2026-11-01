import { useSyncExternalStore } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import { VaultExport } from '../export/VaultExport.tsx';
import { copy } from '../../ui/copy.ts';
import '../export/export.css';

export default function SettingsScreen() {
  const repo = useRepo();
  const user = useSyncExternalStore(repo.auth.onChange, repo.auth.userId);
  return (
    <main className="vault-screen">
      <h1>{copy.settingsTitle}</h1>
      {user ? <VaultExport key={user} repo={repo} /> : <p>{copy.profileNeeded}</p>}
    </main>
  );
}
