import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { EXPORT_FORMATS } from '@shared/export-format.ts';
import type { Repo } from '../../data/adapter.ts';
import type { ExportFormat, ExportTokenMeta } from '../../core/types.ts';
import { Button } from '../../ui/Button.tsx';
import { HoldButton } from '../../ui/HoldButton.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { copy } from '../../ui/copy.ts';
import { formatDate } from '../../core/formatDate.ts';
import { localDateOf } from '../../core/weeks.ts';
import { aiInstructions, copyText, exportUrl, loadPreview } from './export.ts';
import { useOnline } from './useOnline.ts';

const formatLabels = { lines: copy.exportLines, json: copy.exportJson, csv: copy.exportCsv };

export function VaultExport({ repo }: { repo: Repo }) {
  const online = useOnline(repo);
  const [revision, setRevision] = useState(0);
  const [minute, setMinute] = useState(0);
  const [tokens, setTokens] = useState<ExportTokenMeta[] | null>(null);
  const [listError, setListError] = useState(false);
  const [label, setLabel] = useState<string>(copy.tokenDefaultLabel);
  const [token, setToken] = useState<string | null>(null);
  const [manualText, setManualText] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const data = useLiveQuery(async () => {
    try {
      const profile = await repo.q.me();
      if (!profile) return { profile: undefined };
      return { profile, preview: await loadPreview(repo, profile, new Date()) };
    } catch {
      return { error: true };
    }
  }, [repo, revision, minute]);

  useEffect(() => {
    const timer = window.setInterval(() => setMinute((n) => n + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let current = true;
    void repo.exportTokens.listTokens().then((result) => {
      if (!current) return;
      setListError(!result.ok);
      if (result.ok) setTokens(result.value);
    }).catch(() => { if (current) setListError(true); });
    return () => { current = false; };
  }, [repo, revision, online]);

  async function action(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    try { await work(); }
    catch { setMessage(copy.networkRetry); }
    finally { locked.current = false; setBusy(false); }
  }

  async function create(tokenLabel: string) {
    const result = await repo.exportTokens.createToken(tokenLabel);
    if (result.ok) setToken(result.value);
    else setMessage(result.error === 'token_limit' ? copy.tokenLimit : copy.networkRetry);
    setRevision((n) => n + 1);
  }

  async function revoke(meta: ExportTokenMeta, regenerate: boolean) {
    const result = await repo.exportTokens.revokeToken(meta.id);
    if (!result.ok) { setMessage(copy.networkRetry); return; }
    // Preserve the successful revocation even if the following create/list request fails.
    setTokens((rows) => rows?.map((row) => row.id === meta.id ? { ...row, revoked_at: new Date().toISOString() } : row) ?? null);
    setToken(null);
    setMessage(copy.tokenRevokedNotice);
    setRevision((n) => n + 1);
    if (regenerate) await create(meta.label);
  }

  async function clipboard(text: string, success: string) {
    if (await copyText(text)) { setManualText(null); setMessage(success); }
    else { setManualText(text); setMessage(copy.clipboardUnavailable); }
  }

  async function setFormat(format: ExportFormat) {
    const result = await repo.exportTokens.setFormat(format);
    if (!result.ok) setMessage(result.error === 'storage_full' ? copy.storageFull : copy.networkRetry);
    setRevision((n) => n + 1);
  }

  const profile = data?.profile;
  const today = localDateOf(new Date().toISOString(), profile?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const tokenDate = (instant: string) => formatDate(localDateOf(instant, profile?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone), today, copy);
  const url = exportUrl();
  const format = profile?.export_format ?? 'lines';
  return (
    <section className="vault-panel" aria-labelledby="vault-title">
      <h2 id="vault-title">{copy.vaultTitle}</h2>
      <p>{copy.tokenPrivacy}</p>
      {!online && <p role="status">{copy.needsSignal}</p>}
      <p role="status">{message}</p>
      <details className="vault-disclosure">
        <summary>{copy.x8Tokens}</summary>
        <div className="vault-panel">
          <div className="vault-controls">
            <label htmlFor="token-label">{copy.tokenLabel}</label>
            <input id="token-label" value={label} maxLength={32} onChange={(e) => setLabel(e.target.value)} />
            <Button size="xl" disabled={!online || busy || !label.trim() || !profile} onClick={() => void action(() => create(label.trim()))}>
              {copy.generateToken}
            </Button>
          </div>
          {manualText !== null && token === null && <pre className="vault-well">{manualText}</pre>}
          <section className="vault-panel" aria-label={copy.tokenList}>
            <h3>{copy.tokenList}</h3>
            {listError && <p role="alert">{copy.tokenListError}</p>}
            {tokens === null && !listError && <p>{copy.loading}</p>}
            {tokens?.length === 0 && <p>{copy.noTokens}</p>}
            {tokens?.map((meta) => (
              <article className="vault-token" key={meta.id} aria-label={meta.label}>
                <h3>{meta.label}</h3>
                <code>{copy.tokenMask}</code>
                <p>{meta.revoked_at ? copy.tokenRevoked : copy.tokenActive}</p>
                <dl>
                  <dt>{copy.tokenCreated}</dt><dd><time dateTime={meta.created_at}>{tokenDate(meta.created_at)}</time></dd>
                  <dt>{copy.tokenLastUsed}</dt><dd>{meta.last_used_at ? <time dateTime={meta.last_used_at}>{tokenDate(meta.last_used_at)}</time> : copy.tokenNeverUsed}</dd>
                  {meta.revoked_at && <><dt>{copy.tokenRevokedAt}</dt><dd><time dateTime={meta.revoked_at}>{tokenDate(meta.revoked_at)}</time></dd></>}
                </dl>
                {!meta.revoked_at && <>
                  <HoldButton aria-label={copy.revokeToken} variant="secondary" className="vault-danger" holdMs={1200} disabled={!online || busy}
                    onHoldComplete={() => void action(() => revoke(meta, false))}>{copy.revokeToken}</HoldButton>
                  <HoldButton aria-label={copy.regenerateToken} variant="secondary" className="vault-danger" holdMs={1200} disabled={!online || busy}
                    onHoldComplete={() => void action(() => revoke(meta, true))}>{copy.regenerateToken}</HoldButton>
                </>}
              </article>
            ))}
            <Button variant="secondary" disabled={!online || busy} onClick={() => setRevision((n) => n + 1)}>{copy.refresh}</Button>
          </section>
        </div>
      </details>
      <div className="vault-panel">
        <h3 id="format-title">{copy.exportFormat}</h3>
        <div className="vault-formats" role="group" aria-labelledby="format-title">
          {EXPORT_FORMATS.map((value) => <Button key={value} variant={format === value ? 'primary' : 'secondary'}
            aria-pressed={format === value} disabled={!profile || busy}
            onClick={() => void action(() => setFormat(value))}>{formatLabels[value]}</Button>)}
        </div>
      </div>
      <details className="vault-disclosure">
        <summary>{copy.exportPreview}</summary>
        <section className="vault-panel" aria-label={copy.exportPreview}>
          {!data ? <p>{copy.loading}</p> : data.error ? <p role="alert">{copy.exportPreviewError}</p> : !profile ? <p>{copy.profileNeeded}</p> :
            <><pre className="vault-well vault-preview">{data.preview?.body}</pre>
              {data.preview?.body === '' && <p>{copy.exportEmpty}</p>}</>}
          {data?.error && <Button variant="secondary" onClick={() => setRevision((n) => n + 1)}>{copy.retry}</Button>}
        </section>
      </details>
      <details className="vault-disclosure">
        <summary>{copy.x8ExportAccess}</summary>
        <div className="vault-panel">
          <h3>{copy.exportUrl}</h3>
          <code className="vault-well">{url ? `${url}?since=YYYY-MM-DD` : copy.exportUrlMissing}</code>
          <Button variant="secondary" disabled={!url} onClick={() => { if (url) void clipboard(`${url}?since=YYYY-MM-DD`, copy.copied); }}>{copy.copyExportUrl}</Button>
          <Button variant="secondary" style={{ minHeight: 56 }} disabled={!url || !profile}
            onClick={() => { if (url && profile) void clipboard(aiInstructions(profile, url, format), copy.copiedForAi); }}>{copy.copyForAi}</Button>
        </div>
      </details>
      <Sheet open={token !== null} title={copy.generateToken} onClose={() => { setToken(null); setManualText(null); }}>
        <div className="vault-panel">
          <code className="vault-well">{token}</code>
          <p>{copy.tokenShown}</p><p>{copy.tokenPrivacy}</p>
          <Button variant="secondary" onClick={() => {
            // Never let a late clipboard rejection put plaintext back into the page after close.
            if (token) void copyText(token).then((ok) => setMessage(ok ? copy.copied : copy.clipboardUnavailable));
          }}>{copy.copyToken}</Button>
          <p role="status">{message}</p>
        </div>
      </Sheet>
    </section>
  );
}
