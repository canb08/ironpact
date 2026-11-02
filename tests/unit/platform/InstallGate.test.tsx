// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import InstallGate from '../../../src/features/install/InstallGate';
import { copy } from '../../../src/ui/copy';

const platform = vi.hoisted(() => ({
  isStandalone: vi.fn(() => false),
  getInstallBrowser: vi.fn(() => 'ios-safari'),
  canPromptInstall: vi.fn(() => false),
  promptInstall: vi.fn().mockResolvedValue('accepted'),
  subscribeInstall: vi.fn(() => () => {}),
  persistStorageAfterInstall: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../../src/platform/install', () => platform);
vi.mock('../../../src/platform/storage', () => platform);

function renderGate() {
  return render(
    <MemoryRouter initialEntries={['/install']}>
      <Routes>
        <Route path="/install" element={<InstallGate />} />
        <Route path="/" element={<p>Floor destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-reduced-motion');
  platform.isStandalone.mockReturnValue(false);
  platform.getInstallBrowser.mockReturnValue('ios-safari');
  platform.canPromptInstall.mockReturnValue(false);
  platform.promptInstall.mockResolvedValue('accepted');
});

describe('S1 installation gate', () => {
  it.each([
    ['ios-safari', copy.installIosShare], ['android', copy.installAndroidMenu],
    ['ios-other', copy.installOpenSafari], ['other', copy.installOther],
  ])('shows %s instructions and an escape to the app', (browser, instruction) => {
    platform.getInstallBrowser.mockReturnValue(browser);
    renderGate();
    expect(screen.getByRole('heading', { name: copy.installTitle })).toBeTruthy();
    expect(screen.getByText(copy.installKeepData)).toBeTruthy();
    expect(screen.getByText(instruction)).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.installButton })).toBeNull();
    expect(platform.persistStorageAfterInstall).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: copy.installSkip }));
    expect(localStorage.getItem('ironpact.install-dismissed')).toBe('1');
    expect(screen.getByText('Floor destination')).toBeTruthy();
  });

  it('names the unsupported browser and copies the page link', async () => {
    platform.getInstallBrowser.mockReturnValue('ios-other');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderGate();
    expect(screen.getByRole('heading', { name: copy.installOpenInSafari })).toBeTruthy();
    expect(screen.queryByTestId('install-walkthrough')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.installCopyLink }));
    });
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByRole('status').textContent).toBe(copy.installLinkCopied);

    platform.getInstallBrowser.mockReturnValue('other');
    renderGate();
    expect(screen.getByRole('heading', { name: copy.installOpenInChrome })).toBeTruthy();
  });

  it('shows the link to copy when the clipboard refuses', async () => {
    platform.getInstallBrowser.mockReturnValue('other');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    renderGate();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.installCopyLink }));
    });
    expect(screen.getByRole('status').textContent).toBe(copy.installCopyManual);
    expect(screen.getByRole('textbox', { name: copy.installCopyManual }).getAttribute('value'))
      .toBe(window.location.href);
  });

  it('redirects standalone launches without showing S1 and requests storage persistence', async () => {
    platform.isStandalone.mockReturnValue(true);
    renderGate();
    expect(screen.queryByRole('heading', { name: copy.installTitle })).toBeNull();
    expect(screen.getByText('Floor destination')).toBeTruthy();
    await waitFor(() => expect(platform.persistStorageAfterInstall).toHaveBeenCalled());
  });

  it('only invokes a captured prompt on a user tap', async () => {
    platform.getInstallBrowser.mockReturnValue('android');
    platform.canPromptInstall.mockReturnValue(true);
    renderGate();
    expect(screen.queryByTestId('install-walkthrough')).toBeNull();
    expect(platform.promptInstall).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: copy.installButton })));
    expect(platform.promptInstall).toHaveBeenCalledTimes(1);
  });

  it('keeps manual steps and the browser escape available after a prompt error', async () => {
    platform.getInstallBrowser.mockReturnValue('android');
    platform.canPromptInstall.mockReturnValue(true);
    platform.promptInstall.mockResolvedValue('unavailable');
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: copy.installButton }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(copy.installPromptUnavailable));
    expect(screen.getByText(copy.installAndroidMenu)).toBeTruthy();
    expect(screen.getByRole('link', { name: copy.installSkip })).toBeTruthy();
  });

  it('loops the iOS walkthrough and restarts it from Share', () => {
    vi.useFakeTimers();
    renderGate();
    const walk = screen.getByTestId('install-walkthrough');
    expect(walk.getAttribute('data-motion')).toBe('loop');
    expect(screen.getByText(copy.installIosShare)).toBeTruthy();
    expect(screen.queryByText(copy.installIosAdd)).toBeNull();
    act(() => { vi.advanceTimersByTime(Number(walk.getAttribute('data-step-ms'))); });
    expect(screen.getByText(copy.installIosAdd)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.installAgain }));
    expect(screen.getByText(copy.installIosShare)).toBeTruthy();
    expect(screen.queryByText(copy.installIosAdd)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.installDone }));
    expect(localStorage.getItem('ironpact.install-dismissed')).toBe('1');
    expect(screen.getByText('Floor destination')).toBeTruthy();
    vi.useRealTimers();
  });

  it.each(['media', 'toggle'] as const)('keeps the iOS walkthrough static under reduced motion (%s)', (mode) => {
    if (mode === 'media') {
      vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        addEventListener() {},
        removeEventListener() {},
      })));
    } else {
      document.documentElement.dataset.reducedMotion = 'on';
    }
    renderGate();
    const walk = screen.getByTestId('install-walkthrough');
    expect(walk.getAttribute('data-motion')).toBe('static');
    expect(screen.getByText(copy.installIosShare)).toBeTruthy();
    expect(screen.getByText(copy.installIosAdd)).toBeTruthy();
    expect(screen.getByText(copy.installOpen)).toBeTruthy();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-reduced-motion');
  });

  it('shows every Android step at once when the in-app toggle is on', () => {
    document.documentElement.dataset.reducedMotion = 'on';
    platform.getInstallBrowser.mockReturnValue('android');
    renderGate();
    expect(screen.getByTestId('install-walkthrough').getAttribute('data-motion')).toBe('static');
    expect(screen.getByText(copy.installAndroidMenu)).toBeTruthy();
    expect(screen.getByText(copy.installAndroidAdd)).toBeTruthy();
    expect(screen.getByText(copy.installOpen)).toBeTruthy();
  });

  it('keeps motion libraries out of the install screen', () => {
    const source = readFileSync('src/features/install/InstallGate.tsx', 'utf8');
    expect(source).not.toMatch(/motion\/react|@number-flow\/react|canvas-confetti/);
  });
});

describe('Apple startup images', () => {
  it('declares capable head metadata and dark splash files that exist', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />');
    const hrefs = [...html.matchAll(/rel="apple-touch-startup-image"[^>]*href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs.length).toBeGreaterThan(10);
    for (const href of hrefs) {
      expect(href?.startsWith('/icons/apple-splash-')).toBe(true);
      expect(existsSync(`public${href}`)).toBe(true);
      expect(html).toContain(`href="${href}"`);
    }
    const file = readFileSync('public/icons/apple-splash-portrait-750x1334.png');
    expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    let offset = 8;
    let width = 0;
    let height = 0;
    const idats: Buffer[] = [];
    while (offset < file.length) {
      const length = file.readUInt32BE(offset);
      const type = file.subarray(offset + 4, offset + 8).toString('ascii');
      const data = file.subarray(offset + 8, offset + 8 + length);
      if (type === 'IHDR') {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        expect(data[8]).toBe(8);
        expect(data[9]).toBe(2);
      } else if (type === 'IDAT') idats.push(Buffer.from(data));
      else if (type === 'IEND') break;
      offset += 12 + length;
    }
    expect(width).toBe(750);
    expect(height).toBe(1334);
    const raw = inflateSync(Buffer.concat(idats));
    const stride = 1 + width * 3;
    expect([raw[1], raw[2], raw[3]]).toEqual([10, 10, 11]);
    let wordmark = false;
    for (let y = 0; y < height && !wordmark; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * stride + 1 + x * 3;
        if (raw[index] === 242 && raw[index + 1] === 240 && raw[index + 2] === 235) {
          wordmark = true;
          break;
        }
      }
    }
    expect(wordmark).toBe(true);
    expect(stride).toBe(1 + 750 * 3);
  });
});
