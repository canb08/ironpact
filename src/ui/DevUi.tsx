import { useState } from 'react';
import { Settings } from 'lucide-react';
import { setSoundOn, useSound } from '../platform/audio';
import {
  BarbellGlyph, BeltGlyph, FlameGlyph, HandprintGlyph, KettlebellGlyph,
  MinGlyph, PlateGlyph, ScaleGlyph, ShoeGlyph, StopwatchGlyph,
} from './icons';
import {
  BigNumber, Button, Chip, HoldButton, ListRow, PlateBar, Ring, ScreenHeader,
  SegmentedControl, Sheet, Stepper, ToastProvider, copy, useToast,
} from './index';

function Gallery() {
  const [weight, setWeight] = useState(80);
  const [open, setOpen] = useState(false);
  const [segment, setSegment] = useState('lifts');
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'dark');
  const [reduced, setReduced] = useState(document.documentElement.dataset.reducedMotion === 'on');
  const { showToast } = useToast();
  const { enabled: soundOn, play } = useSound();
  const notify = () => showToast({
    message: copy.x1Saved,
    action: { label: copy.undo, onClick: () => { showToast({ message: copy.undone }); } },
  });
  const members = [
    { name: copy.ringYou, credits: 2, target: 3 },
    { name: copy.ringPartner, credits: 1, target: 3 },
  ] as const;
  const ringMembers = members.map((member, index) => ({
    ...member, id: String(index), initial: member.name.slice(0, 1).toUpperCase(),
    color: index === 0 ? 'var(--plate-red)' : 'var(--plate-blue)',
  }));
  return (
    <main className="ui-gallery">
      <header>
        <ScreenHeader title={copy.devTitle} onBack={notify} trailing={
          <Button variant="quiet" aria-label={copy.settings} onClick={() => setOpen(true)}>
            <Settings size={24} aria-hidden="true" />
          </Button>
        } />
        <p>{copy.x1Foundation}</p>
      </header>
      <fieldset className="ui-gallery__theme">
        <legend>{copy.devTheme}</legend>
        {(['dark', 'light'] as const).map((choice) => <Button
          key={choice} variant="secondary" aria-pressed={theme === choice}
          onClick={() => { document.documentElement.dataset.theme = choice; setTheme(choice); }}
        >{choice === 'dark' ? copy.devDark : copy.devLight}</Button>)}
        <Button variant="quiet" aria-pressed={reduced} onClick={() => {
          document.documentElement.dataset.reducedMotion = reduced ? 'off' : 'on';
          setReduced(!reduced);
        }}>{copy.x1Motion}</Button>
      </fieldset>
      <section>
        <h2>{copy.x1SharedBar}</h2>
        <PlateBar members={members} />
        <p>{copy.x1SharedBarHint}</p>
      </section>
      <section>
        <h2>{copy.devButtons}</h2>
        <Button size="xl" onClick={notify}>{copy.x1Start}</Button>
        <div className="ui-gallery__row">
          <Button variant="secondary" onClick={notify}>{copy.devSecondary}</Button>
          <Button variant="quiet" onClick={notify}>{copy.x1Quiet}</Button>
          <Button disabled>{copy.devDisabled}</Button>
          <HoldButton onHoldComplete={notify}>{copy.x1Finish}</HoldButton>
          <HoldButton onHoldComplete={() => { showToast({ message: copy.x1Deleted }); }}>{copy.x1Delete}</HoldButton>
        </div>
      </section>
      <section>
        <h2>{copy.x1Segments}</h2>
        <SegmentedControl label={copy.progressTitle} value={segment} onChange={setSegment} options={[
          { value: 'lifts', label: copy.x1Lifts }, { value: 'cardio', label: copy.x1Cardio },
          { value: 'fight', label: copy.x1Fight }, { value: 'body', label: copy.x1Body },
        ]} />
        <p>{({ lifts: copy.x1Lifts, cardio: copy.x1Cardio, fight: copy.x1Fight, body: copy.x1Body })[segment]}</p>
      </section>
      <section>
        <h2>{copy.x1Lists}</h2>
        <ListRow title={copy.x1LastWorkout} detail={copy.x1LastWorkoutDetail} trailing={copy.x1Yesterday} />
        <ListRow title={copy.x1Settings} detail={copy.x1SettingsDetail} chevron onClick={() => setOpen(true)} />
      </section>
      <section>
        <h2>{copy.devStepper}</h2>
        <Stepper label={copy.weight} value={weight} onChange={setWeight} min={0} max={300} step={2.5} unit={copy.kg} />
      </section>
      <section>
        <h2>{copy.x1Numbers}</h2>
        <div className="ui-gallery__numbers">
          <BigNumber value={weight} unit={copy.kg} size="xl" />
          <BigNumber value={weight} unit={copy.kg} />
          <BigNumber value={weight} unit={copy.kg} size="mega" />
        </div>
        <div className="ui-gallery__row"><Chip>{copy.x1Saved}</Chip><Chip tone="pr">{copy.x1Pr}</Chip><Chip tone="success">{copy.x1Synced}</Chip></div>
      </section>
      <section>
        <h2>{copy.x1ThinPlate}</h2>
        <PlateBar members={[{ ...members[0], credits: 1.5, minCount: 1 }, { ...members[1], credits: 0.5, minCount: 1 }]} />
      </section>
      <section>
        <h2>{copy.ringDemo}</h2>
        <div className="ui-gallery__rings">
          <Ring members={ringMembers.slice(0, 1)} />
          <Ring members={ringMembers} />
          <Ring members={[...ringMembers, { id: 'third', name: copy.ringThird, initial: copy.ringThird.slice(0, 1).toUpperCase(), color: 'var(--steel)', target: 3, credits: 0.5, minCount: 1 }]} />
        </div>
      </section>
      <section>
        <h2>{copy.devGlyphs}</h2>
        <div className="ui-glyphs">
          {([
            [BarbellGlyph, copy.glyphBarbell], [PlateGlyph, copy.glyphPlate],
            [KettlebellGlyph, copy.glyphKettlebell], [BeltGlyph, copy.glyphBelt],
            [ShoeGlyph, copy.glyphShoe], [ScaleGlyph, copy.glyphScale],
            [MinGlyph, copy.min], [FlameGlyph, copy.glyphFlame],
            [HandprintGlyph, copy.chalkHandprint], [StopwatchGlyph, copy.glyphWatch],
          ] as const).map(([Glyph, label]) => <p key={label}><Glyph />{label}</p>)}
        </div>
      </section>
      <section>
        <h2>{copy.devSheet}</h2>
        <Button variant="secondary" onClick={() => setOpen(true)}>{copy.devOpenSheet}</Button>
      </section>
      <section>
        <h2>{copy.devToast}</h2>
        <Button variant="secondary" onClick={notify}>{copy.devShowToast}</Button>
      </section>
      <section>
        <h2>{copy.devSound}</h2>
        <p>{copy.devSoundHint}</p>
        <div className="ui-gallery__row">
          <Button variant="secondary" aria-pressed={soundOn} onClick={() => setSoundOn(!soundOn)}>{soundOn ? copy.devSoundOn : copy.devSoundOff}</Button>
          {([
            ['clank', copy.devSoundClank], ['3-2-1', copy.devSoundCountdown], ['bell', copy.devSoundBell],
            ['pr-riser', copy.devSoundRiser], ['ring-chord', copy.devSoundChord], ['plate', copy.devSoundPlate],
          ] as const).map(([sound, label]) => <Button key={sound} variant="secondary" onClick={() => play(sound)}>{label}</Button>)}
        </div>
      </section>
      <Sheet open={open} title={copy.devSheet} onClose={() => setOpen(false)}>
        <p>{copy.devSheetBody}</p>
        <Button onClick={() => setOpen(false)}>{copy.x1Done}</Button>
      </Sheet>
    </main>
  );
}

export default function DevUi() {
  return <ToastProvider><Gallery /></ToastProvider>;
}
