import { useState } from 'react';
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
        <p>{copy.appName}</p>
        <h1>{copy.devTitle}</h1>
        <p>{copy.devIntro}</p>
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
        </div>
      </section>
      <section>
        <h2>{copy.devNumbers}</h2>
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
        <HoldButton size="xl" onHoldComplete={notify}>
          {copy.finish}
        </HoldButton>
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
