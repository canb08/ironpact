// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let registered: Array<[string, EventListenerOrEventListenerObject]>;

beforeEach(() => {
  vi.resetModules();
  registered = [];
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    registered.push([type, listener]);
    add(type, listener, options);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [type, listener] of registered) window.removeEventListener(type, listener);
  vi.restoreAllMocks();
});

describe('standalone detection', () => {
  it.each([
    [true, undefined, true], [false, true, true], [false, false, false],
    [false, undefined, false], [true, false, true],
  ])('display-mode=%s, navigator.standalone=%s → %s', async (media, legacy, expected) => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: media })));
    vi.stubGlobal('navigator', { standalone: legacy });
    const { isStandalone } = await import('../../../src/platform/install');
    expect(isStandalone()).toBe(expected);
    expect(window.matchMedia).toHaveBeenCalledWith('(display-mode: standalone)');
  });

  it('works when matchMedia is missing and outside a browser', async () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('navigator', { standalone: true });
    const { isStandalone } = await import('../../../src/platform/install');
    expect(isStandalone()).toBe(true);
    vi.stubGlobal('navigator', undefined);
    expect(isStandalone()).toBe(false);
    const { getInstallBrowser } = await import('../../../src/platform/install');
    expect(getInstallBrowser()).toBe('other');
    vi.stubGlobal('window', undefined);
    expect(isStandalone()).toBe(false);
  });

  it('notifies subscribers when the display mode changes', async () => {
    const mode = new EventTarget();
    Object.assign(mode, { matches: false });
    vi.stubGlobal('matchMedia', vi.fn(() => mode));
    const install = await import('../../../src/platform/install');
    const changed = vi.fn();
    const unsubscribe = install.subscribeInstall(changed);
    Object.assign(mode, { matches: true });
    mode.dispatchEvent(new Event('change'));
    expect(install.isStandalone()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe('installation instructions', () => {
  it.each([
    ['Mozilla/5.0 (iPhone) Version/18.0 Mobile/15E148 Safari/604.1', '', 0, 'ios-safari'],
    ['Mozilla/5.0 (iPhone) CriOS/130 Mobile/15E148 Safari/604.1', '', 0, 'ios-other'],
    ['Mozilla/5.0 (iPhone) FxiOS/130 Mobile/15E148 Safari/604.1', '', 0, 'ios-other'],
    ['Mozilla/5.0 (iPhone) Mobile/15E148 Instagram', '', 0, 'ios-other'],
    ['Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1', 'MacIntel', 5, 'ios-safari'],
    ['Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1', 'MacIntel', 0, 'other'],
    ['Mozilla/5.0 (Android) Chrome/130 Safari/537.36', '', 0, 'android'],
    ['Mozilla/5.0 Firefox/130', '', 0, 'other'],
  ])('%s → %s', async (userAgent, platform, maxTouchPoints, expected) => {
    vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints });
    const { getInstallBrowser } = await import('../../../src/platform/install');
    expect(getInstallBrowser()).toBe(expected);
  });
});

describe('deferred install prompt', () => {
  it.each(['accepted', 'dismissed'] as const)('captures early events and consumes %s prompts once', async (outcome) => {
    const install = await import('../../../src/platform/install');
    expect(await install.promptInstall()).toBe('unavailable');
    const prompt = vi.fn().mockResolvedValue({ outcome, platform: 'web' });
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
    window.dispatchEvent(event); // Capture before the screen subscribes.
    expect(event.defaultPrevented).toBe(true);
    expect(install.canPromptInstall()).toBe(true);
    const changed = vi.fn();
    const unsubscribe = install.subscribeInstall(changed);
    const result = install.promptInstall();
    expect(prompt).toHaveBeenCalledTimes(1); // Called synchronously in the tap.
    expect(await result).toBe(outcome);
    expect(await install.promptInstall()).toBe('unavailable');
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.dispatchEvent(new Event('appinstalled'));
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('clears prompts after installation and handles rejected prompts', async () => {
    const install = await import('../../../src/platform/install');
    const event = () => Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockRejectedValue(new Error('unavailable')),
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
    });
    window.dispatchEvent(event());
    expect(await install.promptInstall()).toBe('unavailable');
    window.dispatchEvent(event());
    window.dispatchEvent(new Event('appinstalled'));
    expect(install.canPromptInstall()).toBe(false);
    window.dispatchEvent(new Event('beforeinstallprompt'));
    expect(install.canPromptInstall()).toBe(false);
  });
});
