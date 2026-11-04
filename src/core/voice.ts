/** A speech result is a draft only. Relative kg changes use the injected draft. */
export interface VoiceDraft { kg?: number; reps?: number; same?: true }

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function integer(words: string): number | null {
  const small = SMALL.indexOf(words);
  if (small >= 0) return small;
  const parts = words.split(' ');
  const tens = TENS.indexOf(parts[0] ?? '');
  if (tens >= 2) {
    if (parts.length === 1) return tens * 10;
    const unit = SMALL.indexOf(parts[1] ?? '');
    return parts.length === 2 && unit > 0 && unit < 10 ? tens * 10 + unit : null;
  }
  const hundred = /^(one|two|three|four|five) hundred(?: (?:and )?(.+))?$/.exec(words);
  if (!hundred) return null;
  const rest = hundred[2] === undefined ? 0 : integer(hundred[2]);
  return rest !== null && rest < 100 ? SMALL.indexOf(hundred[1]!) * 100 + rest : null;
}

function number(text: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text === 'a half' || text === 'half') return .5;
  if (text === 'a quarter' || text === 'quarter') return .25;
  const fraction = /^(.+) and (a half|a quarter|three quarters)$/.exec(text);
  if (fraction) {
    const whole = integer(fraction[1]!);
    return whole === null ? null : whole + (fraction[2] === 'a half' ? .5 : fraction[2] === 'a quarter' ? .25 : .75);
  }
  const decimal = /^(.+) point (.+)$/.exec(text);
  if (decimal) {
    const whole = integer(decimal[1]!);
    const digits = decimal[2]!.split(' ').map((word) => SMALL.indexOf(word));
    if (whole === null || digits.some((digit) => digit < 0 || digit > 9)) return null;
    return whole + Number(`0.${digits.join('')}`);
  }
  return integer(text);
}

const withoutKg = (text: string) => text.replace(/\s*(?:kilograms?|kilos?|kgs?)$/, '').trim();
const withoutReps = (text: string) => text.replace(/\s*(?:repetitions?|reps?)$/, '').trim();
const validKg = (kg: number | null): kg is number => kg !== null && Number.isFinite(kg) && kg >= -100 && kg <= 500 && Number.isInteger(kg * 4);
const validReps = (reps: number | null): reps is number => reps !== null && Number.isInteger(reps) && reps >= 1 && reps <= 100;

/** Anchored English grammar: never extract a plausible set from unrelated speech. */
export function parseVoice(phrase: string, currentKg?: number): VoiceDraft | null {
  const text = phrase.toLowerCase().trim().replace(/[.!?]+$/, '').replace(/([a-z])-([a-z])/g, '$1 $2').replace(/\s+/g, ' ');
  if (text === 'same again') return { same: true };
  const relative = /^(plus|add|minus|subtract) (.+)$/.exec(text);
  if (relative) {
    const delta = number(withoutKg(relative[2]!));
    if (delta === null || currentKg === undefined || !Number.isFinite(currentKg)) return null;
    const kg = currentKg + (relative[1] === 'minus' || relative[1] === 'subtract' ? -delta : delta);
    return validKg(kg) ? { kg } : null;
  }
  const pair = text.split(/\s+(?:by|for|times|x)\s+|\s*×\s*/);
  if (pair.length === 2) {
    const kg = number(withoutKg(pair[0]!));
    const reps = number(withoutReps(pair[1]!));
    return validKg(kg) && kg >= 0 && validReps(reps) ? { kg, reps } : null;
  }
  if (/(?:kilograms?|kilos?|kgs?)$/.test(text)) {
    const kg = number(withoutKg(text));
    return validKg(kg) && kg >= 0 ? { kg } : null;
  }
  if (/(?:repetitions?|reps?)$/.test(text)) {
    const reps = number(withoutReps(text));
    return validReps(reps) ? { reps } : null;
  }
  return null;
}
