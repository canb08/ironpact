import { useState } from 'react';
import { setSoundOn, useSound } from '../platform/audio';
import { Check } from 'lucide-react';
import {
  BarbellGlyph,
  BeltGlyph,
  FlameGlyph,
  HandprintGlyph,
  KettlebellGlyph,
  MinGlyph,
  PlateGlyph,
  ScaleGlyph,
  ShoeGlyph,
  StopwatchGlyph,
} from './icons';
import {
  BigNumber,
  Button,
  Chip,
  HoldButton,
  Sheet,
  Stepper,
  ToastProvider,
  copy,
  useToast,
} from './index';

function Gallery() {
  const [weight, setWeight] = useState(80);
  const [open, setOpen] = useState(false);
  const { showToast } = useToast();
  const { enabled: soundOn, play } = useSound();
  const notify = () =>
    showToast({
      message: copy.setLogged,
      action: {
        label: copy.undo,
        onClick: () => {
          showToast({ message: copy.undone });
        },
      },
    });
  return (
    <main className="ui-gallery">
      <header>
        <p className="ui-eyebrow">{copy.appName}</p>
        <h1>{copy.devTitle}</h1>
        <p>{copy.devFoundation}</p>
      </header>
      <fieldset className="ui-gallery__theme">
        <legend>{copy.devTheme}</legend>
        <Button
          variant="secondary"
          onClick={() => {
            document.documentElement.dataset.theme = 'dark';
          }}
        >
          {copy.devDark}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            document.documentElement.dataset.theme = 'light';
          }}
        >
          {copy.devLight}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            delete document.documentElement.dataset.batterySaver;
          }}
        >
          {copy.devGrainOn}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            document.documentElement.dataset.batterySaver = 'on';
          }}
        >
          {copy.devBatterySaver}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            delete document.documentElement.dataset.reducedMotion;
          }}
        >
          {copy.devMotion}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            document.documentElement.dataset.reducedMotion = 'on';
          }}
        >
          {copy.devReduceMotion}
        </Button>
      </fieldset>
      <section>
        <h2>{copy.devButtons}</h2>
        <div className="ui-gallery__row">
          <Button onClick={notify}>{copy.devPrimary}</Button>
          <Button variant="secondary" onClick={notify}>
            {copy.devSecondary}
          </Button>
          <Button variant="ghost" onClick={notify}>
            {copy.devGhost}
          </Button>
          <Button disabled>{copy.devDisabled}</Button>
          <Button size="xl" onClick={notify}>
            {copy.logSet}
          </Button>
          <Button variant="secondary" onClick={notify}>
            <Check size={24} strokeWidth={2} aria-hidden="true" />
            {copy.devSaved}
          </Button>
        </div>
      </section>
      <section className="ui-edge-steel">
        <h2>{copy.devEdge}</h2>
        <BigNumber value={weight} unit={copy.kg} />
        <div className="ui-gallery__row">
          <Chip>{copy.baselineBuilding}</Chip>
          <Chip>{copy.minQuick}</Chip>
        </div>
      </section>
      <section>
        <h2>{copy.devStepper}</h2>
        <Stepper
          label={copy.weight}
          value={weight}
          onChange={setWeight}
          min={0}
          max={300}
          step={2.5}
        />
      </section>
      <section>
        <h2>{copy.devHold}</h2>
        <HoldButton className="ui-knurl" size="xl" onHoldComplete={notify}>
          {copy.rackIt}
        </HoldButton>
      </section>
      <section>
        <h2>{copy.devGlyphs}</h2>
        <div className="ui-glyphs">
          <p>
            <BarbellGlyph />
            {copy.glyphBarbell}
          </p>
          <p>
            <PlateGlyph />
            {copy.glyphPlate}
          </p>
          <p>
            <KettlebellGlyph />
            {copy.glyphKettlebell}
          </p>
          <p>
            <BeltGlyph />
            {copy.glyphBelt}
          </p>
          <p>
            <ShoeGlyph />
            {copy.glyphShoe}
          </p>
          <p>
            <ScaleGlyph />
            {copy.glyphScale}
          </p>
          <p>
            <MinGlyph />
            {copy.min}
          </p>
          <p>
            <FlameGlyph />
            {copy.glyphFlame}
          </p>
          <p>
            <HandprintGlyph />
            {copy.chalkHandprint}
          </p>
          <p>
            <StopwatchGlyph />
            {copy.glyphWatch}
          </p>
        </div>
      </section>
      <section>
        <h2>{copy.devGlass}</h2>
        <div className="ui-glass ui-glass-bar">{copy.devGlass}</div>
      </section>
      <section>
        <h2>{copy.devSheet}</h2>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {copy.devOpenSheet}
        </Button>
      </section>
      <section>
        <h2>{copy.devToast}</h2>
        <Button variant="secondary" onClick={notify}>
          {copy.devShowToast}
        </Button>
      </section>
      <section>
        <h2>{copy.devSound}</h2>
        <p>{copy.devSoundHint}</p>
        <div className="ui-gallery__row">
          <Button
            variant="secondary"
            aria-pressed={soundOn}
            onClick={() => {
              setSoundOn(!soundOn);
            }}
          >
            {soundOn ? copy.devSoundOn : copy.devSoundOff}
          </Button>
          <Button variant="secondary" onClick={() => play('clank')}>
            {copy.devSoundClank}
          </Button>
          <Button variant="secondary" onClick={() => play('3-2-1')}>
            {copy.devSoundCountdown}
          </Button>
          <Button variant="secondary" onClick={() => play('bell')}>
            {copy.devSoundBell}
          </Button>
          <Button variant="secondary" onClick={() => play('pr-riser')}>
            {copy.devSoundRiser}
          </Button>
          <Button variant="secondary" onClick={() => play('ring-chord')}>
            {copy.devSoundChord}
          </Button>
          <Button variant="secondary" onClick={() => play('plate')}>
            {copy.devSoundPlate}
          </Button>
        </div>
      </section>
      <Sheet open={open} title={copy.devSheet} onClose={() => setOpen(false)}>
        <p>{copy.devSheetBody}</p>
        <Button onClick={() => setOpen(false)}>{copy.lockIn}</Button>
      </Sheet>
    </main>
  );
}

export default function DevUi() {
  return (
    <ToastProvider>
      <Gallery />
    </ToastProvider>
  );
}
