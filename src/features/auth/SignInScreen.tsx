import { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { RepoContext } from '../../app/repoContext.ts';
import { Button } from '../../ui/Button.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { CodeBoxes } from './CodeBoxes.tsx';
import { readJoinCode } from './joinCode.ts';
import { isEmail, otpLength } from './otp.ts';
import './sign-in.css';

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
  const codeGroup = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const ticking = wait > 0;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setWait((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(id);
  }, [ticking]);
  useEffect(() => {
    if (step === 'code') codeGroup.current?.querySelector('input')?.focus();
  }, [step]);

  async function send() {
    if (!repo || wait > 0 || busy.current) return;
    if (!isEmail(email)) { setError(copy.invalidEmail); return; }
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await repo.auth.sendCode(email.trim());
      if (!result.ok) {
        if (result.error === 'rate_limited') setWait(60);
        else setError(result.error === 'invalid_email' ? copy.invalidEmail : copy.signInOffline);
        return;
      }
      setCode('');
      setWait(60);
      setStep('code');
    } catch {
      setError(copy.signInOffline);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function verify() {
    if (!repo || busy.current || code.length !== length) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await repo.auth.verifyCode(email.trim(), code);
      if (!result.ok) {
        setError(result.error === 'bad_code' ? copy.wrongCode
          : result.error === 'expired' ? copy.expiredCode : copy.signInOffline);
        return;
      }
      const join = readJoinCode();
      await navigate(join ? `/join/${join}` : '/crew/new', { replace: true });
    } catch {
      setError(copy.signInOffline);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return <main className="sign-in">
    <p className="sign-in__mark">{copy.appName}</p>
    <header>
      <h1>{step === 'email' ? copy.x9SignIn : copy.x9CheckEmail}</h1>
      <p id="signin-hint">{step === 'email' ? copy.x9SignInHint : fill(copy.x9CodeHint, { email: email.trim() })}</p>
    </header>
    <form className="sign-in__form" noValidate onSubmit={(event) => {
      event.preventDefault();
      void (step === 'email' ? send() : verify());
    }}>
      {step === 'email' ? <label className="sign-in__email">
        <span>{copy.emailLabel}</span>
        <input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
          value={email} disabled={!repo || pending} aria-describedby="signin-hint signin-error"
          aria-invalid={error === copy.invalidEmail} onChange={(event) => setEmail(event.target.value)} />
      </label> : <div ref={codeGroup} className="sign-in__code">
        <CodeBoxes mode="digits" length={length} value={code} onChange={setCode} disabled={!repo || pending} />
      </div>}
      <p id="signin-error" role="alert">{error}</p>
      <div className="sign-in__actions">
        <Button type="submit" size="xl" disabled={!repo || pending || (step === 'email' ? wait > 0 : code.length !== length)}>
          {pending ? (step === 'email' ? copy.sending : copy.checking) : (step === 'email' ? copy.sendCode : copy.x9Verify)}
        </Button>
        {step === 'code' && <>
          <Button variant="secondary" disabled={!repo || pending || wait > 0} onClick={() => void send()}>{copy.x9Resend}</Button>
          <Button variant="quiet" disabled={pending} onClick={() => { setStep('email'); setCode(''); setError(null); }}>{copy.x9ChangeEmail}</Button>
        </>}
        {wait > 0 && <p role="status">{fill(step === 'code' ? copy.x9ResendWait : copy.otpCountdown, { seconds: wait })}</p>}
      </div>
    </form>
  </main>;
}
