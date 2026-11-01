const STORAGE_KEY = 'ironpact.join-code';
const INSTALL_KEY = 'ironpact.install-dismissed';

/** Same folding the redeem RPC does: uppercase, drop spaces and dashes, O/I/L. */
export function normalizeInvite(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 10);
}

export function rememberJoinCode(code: string): void {
  const next = normalizeInvite(code);
  if (next.length === 0) return;
  sessionStorage.setItem(STORAGE_KEY, next);
}

export function readJoinCode(): string | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const next = normalizeInvite(value);
    return next.length > 0 ? next : null;
  } catch {
    return null;
  }
}

export function joinCodeFromPath(path: string): string | null {
  const match = /^\/join\/([^/]+)$/.exec(path);
  const raw = match?.[1];
  if (!raw) return null;
  try {
    const code = normalizeInvite(decodeURIComponent(raw));
    return code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

export function installDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstallGate(): void {
  try {
    localStorage.setItem(INSTALL_KEY, '1');
  } catch {
    /* private mode: the gate can show again next launch */
  }
}
