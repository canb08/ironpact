import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { RepoContext } from '../../app/repoContext.ts';
import { Button } from '../../ui/Button.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { CodeBoxes } from './CodeBoxes.tsx';
import { readJoinCode } from './joinCode.ts';
import { isEmail, otpLength } from './otp.ts';

export default function SignInScreen() {
  const repo = useContext(RepoContext);
  const navigate = useNavigate();
  const length = otpLength();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ticking = wait > 0;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setWait((left) => (left > 0 ? left - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  async function send() {
    if (!repo || wait > 0 || pending) return;
    if (!isEmail(email)) {
      setError(copy.invalidEmail);
      return;
    }
    setPending(true);
    setError(null);
    const result = await repo.auth.sendCode(email.trim());
    setPending(false);
    if (!result.ok) {
      if (result.error === 'rate_limited') setWait(60);
      else if (result.error === 'invalid_email') setError(copy.invalidEmail);
      else setError(copy.signInOffline);
      return;
    }
    setStep('code');
  }

  async function verify() {
    if (!repo || pending || code.length !== length) return;
    setPending(true);
    setError(null);
    const result = await repo.auth.verifyCode(email.trim(), code);
    setPending(false);
    if (!result.ok) {
      if (result.error === 'bad_code') setError(copy.wrongCode);
      else if (result.error === 'expired') setError(copy.expiredCode);
      else setError(copy.signInOffline);
      return;
    }
    const join = readJoinCode();
    await navigate(join ? `/join/${join}` : '/crew/new', { replace: true });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col gap-4 px-4 py-8">
      <p className="text-lg font-semibold tracking-wide">{copy.appName}</p>
      <label className="grid gap-2">
        <span>{copy.emailLabel}</span>
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          disabled={!repo || pending || step === 'code'}
          className="min-h-12 rounded-md border border-line bg-surface-1 px-3 text-text"
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {step === 'email' ? (
        <Button size="xl" disabled={!repo || pending || wait > 0} onClick={() => void send()}>
          {pending ? copy.sending : copy.sendCode}
        </Button>
      ) : (
        <>
          <CodeBoxes mode="digits" length={length} value={code} onChange={setCode} disabled={!repo || pending} />
          <Button size="xl" disabled={!repo || pending || code.length !== length} onClick={() => void verify()}>
            {pending ? copy.checking : copy.lockIn}
          </Button>
          <Button variant="ghost" disabled={!repo || pending || wait > 0} onClick={() => void send()}>
            {copy.sendCode}
          </Button>
        </>
      )}
      {wait > 0 ? <p>{fill(copy.otpCountdown, { seconds: wait })}</p> : null}
      {error ? <p>{error}</p> : null}
    </main>
  );
}
