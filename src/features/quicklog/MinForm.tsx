import { useState, type FormEvent } from 'react';
import { uiSchemas } from '../../core/validate.ts';
import { useRepo } from '../../app/useRepo.ts';
import { Button, copy } from '../../ui';
import { useToast } from '../../ui/useToast.ts';
import { useRepoQuery } from '../floor/useRepoQuery.ts';

export function MinForm() {
  const repo = useRepo();
  const { showToast } = useToast();
  const profile = useRepoQuery(() => repo.q.me(), [repo]);
  const [draft, setDraft] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const value = draft ?? profile?.min_default_label ?? '';
  const labelError = uiSchemas.min_label.safeParse(value).success ? null : copy.keepTo40;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setServerError(null);
    if (labelError) return;
    setSaving(true);
    try {
      const result = await repo.w.logMin(value);
      if (!result.ok) setServerError(result.error === 'storage_full' ? copy.storageFull : copy.outOfRange);
      else showToast({ message: copy.x11MinSaved });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="ql-form" onSubmit={(event) => { void onSubmit(event); }}>
      <div className="ql-field">
        <label htmlFor="min-label">{copy.minLabel}</label>
        <input id="min-label" autoComplete="off" value={value} aria-invalid={attempted && labelError !== null} onChange={(event) => setDraft(event.currentTarget.value)} />
        {attempted && labelError ? <p className="ql-error" role="alert" data-testid="error-min">{labelError}</p> : null}
      </div>
      {serverError ? <p className="ql-error" role="alert">{serverError}</p> : null}
      <Button type="submit" size="xl" className="ql-save" disabled={saving || profile === undefined}>{copy.x11SaveMin}</Button>
    </form>
  );
}
