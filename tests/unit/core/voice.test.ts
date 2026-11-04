import { describe, expect, it } from 'vitest';
import { parseVoice, type VoiceDraft } from '../../../src/core/voice.ts';

describe('parseVoice', () => {
  it.each<[string, VoiceDraft]>([
    ['ninety by five', { kg: 90, reps: 5 }],
    ['100 kilos for 3', { kg: 100, reps: 3 }],
    ['same again', { same: true }],
    ['90 by 5', { kg: 90, reps: 5 }],
    ['90kg x 5', { kg: 90, reps: 5 }],
    ['90 × 5', { kg: 90, reps: 5 }],
    ['90 times five reps', { kg: 90, reps: 5 }],
    ['ninety kilograms for five repetitions', { kg: 90, reps: 5 }],
    ['twenty-five by ten', { kg: 25, reps: 10 }],
    ['one hundred by twelve', { kg: 100, reps: 12 }],
    ['one hundred and twenty five kilos for three', { kg: 125, reps: 3 }],
    ['two hundred fifty by one', { kg: 250, reps: 1 }],
    ['five hundred by one hundred', { kg: 500, reps: 100 }],
    ['zero by twenty', { kg: 0, reps: 20 }],
    ['ninety two and a half by six', { kg: 92.5, reps: 6 }],
    ['ninety point five by seven', { kg: 90.5, reps: 7 }],
    ['one point two five kilos for eight', { kg: 1.25, reps: 8 }],
    ['a half kilo for nine', { kg: .5, reps: 9 }],
    ['a quarter kg for eleven', { kg: .25, reps: 11 }],
    ['ninety and three quarters by thirteen', { kg: 90.75, reps: 13 }],
    ['92.5 kilograms by 15 reps', { kg: 92.5, reps: 15 }],
    ['  NINETY   BY FIVE! ', { kg: 90, reps: 5 }],
    ['90 kilos', { kg: 90 }], ['twenty kg', { kg: 20 }],
    ['five reps', { reps: 5 }], ['100 repetitions', { reps: 100 }],
    ['sixteen by seventeen', { kg: 16, reps: 17 }],
    ['eighteen by nineteen', { kg: 18, reps: 19 }],
    ['forty by thirty', { kg: 40, reps: 30 }],
    ['sixty by seventy', { kg: 60, reps: 70 }],
    ['eighty by fourteen', { kg: 80, reps: 14 }],
    ['half kg', { kg: .5 }], ['quarter kg', { kg: .25 }],
  ])('parses %s', (phrase, draft) => expect(parseVoice(phrase)).toEqual(draft));

  it.each<[string, number, number]>([
    ['plus two and a half', 90, 92.5], ['plus 2.5 kilos', 90, 92.5],
    ['minus five', 90, 85], ['subtract 1.25', 90, 88.75], ['add a quarter', 90, 90.25],
    ['plus zero', 0, 0], ['minus two and a half', 0, -2.5],
    ['plus five', 495, 500], ['minus one hundred', 0, -100],
  ])('resolves %s against injected kg %s', (phrase, current, kg) => expect(parseVoice(phrase, current)).toEqual({ kg }));

  it.each([
    '', 'hello', 'ninety', 'log ninety by five now', 'ninety by five and save',
    '90 by 5 by 3', 'same again please', 'one two by five', 'twenty zero by five',
    'six hundred by five', 'one hundred and nonsense by five', 'one hundred hundred by five',
    'ninety point ten by five', 'ninety point unknown by five', 'nonsense point five by five',
    'nonsense and a half by five', '90 by 0', '90 by 101', '90 by 2.5', '501 by 5',
    '-20 by 5', '90 pounds for 5', 'NaN kilos', 'Infinity kilos', '0.1 kilos', '101 reps',
    '0 reps', '2.5 reps', '90 by nonsense', 'plus nonsense', 'plus two and a half',
    'plus 2 by 5', '90,5 by 5',
  ])('rejects incomplete, ambiguous or unsafe speech: %s', (phrase) => expect(parseVoice(phrase)).toBeNull());

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite injected kg %s', (kg) => expect(parseVoice('plus five', kg)).toBeNull());
  it('rejects relative changes outside the supported range or quarter kg steps', () => {
    expect(parseVoice('plus five', 500)).toBeNull();
    expect(parseVoice('minus five', -100)).toBeNull();
    expect(parseVoice('plus 0.1', 90)).toBeNull();
    expect(parseVoice('plus nonsense', 90)).toBeNull();
  });
});
