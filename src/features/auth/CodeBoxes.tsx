import { useRef } from 'react';
import { copy, fill } from '../../ui/copy.ts';
import { normalizeInvite } from './joinCode.ts';

export function CodeBoxes({
  value,
  length,
  onChange,
  mode,
  disabled,
}: {
  value: string;
  length: number;
  onChange: (next: string) => void;
  mode: 'digits' | 'invite';
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length }, (_, index) => value[index] ?? '');

  function write(next: string) {
    const cleaned =
      mode === 'digits' ? next.replace(/\D/g, '').slice(0, length) : normalizeInvite(next);
    onChange(cleaned);
    const focusAt = Math.min(cleaned.length, length - 1);
    if (cleaned.length > 0) refs.current[focusAt]?.focus();
  }

  return (
    <div
      role="group"
      aria-label={mode === 'digits' ? copy.codeLabel : copy.joinCodeLabel}
      className={mode === 'invite' ? 'grid grid-cols-5 gap-2' : 'grid grid-cols-6 gap-2'}
    >
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={char}
          disabled={disabled}
          inputMode={mode === 'digits' ? 'numeric' : 'text'}
          autoComplete={mode === 'digits' && index === 0 ? 'one-time-code' : 'off'}
          autoCapitalize={mode === 'invite' ? 'characters' : 'off'}
          aria-label={fill(mode === 'digits' ? copy.codeDigit : copy.inviteChar, { n: index + 1 })}
          className="h-14 min-w-0 rounded-md border border-line bg-surface-1 text-center font-mono text-lg text-text"
          onChange={(event) => {
            const raw = event.target.value;
            if (raw.length > 1) {
              write(`${value.slice(0, index)}${raw}`);
              return;
            }
            write(`${value.slice(0, index)}${raw}${value.slice(index + 1)}`);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !chars[index] && index > 0) {
              event.preventDefault();
              write(`${value.slice(0, index - 1)}${value.slice(index)}`);
              refs.current[index - 1]?.focus();
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            write(event.clipboardData.getData('text'));
          }}
        />
      ))}
    </div>
  );
}
