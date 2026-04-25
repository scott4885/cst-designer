/**
 * logger — unit tests for the centralized scoped logger.
 *
 * The logger is the single chokepoint for ad-hoc console.* calls across
 * the app. These tests verify the scope+level prefix, error-vs-message
 * formatting, and the dev/prod gating behaviour.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('logger', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    debugSpy.mockRestore();
    vi.resetModules();
  });

  it('prefixes every log with [level][scope]', async () => {
    const { log } = await import('../logger');
    log.error('export.excel', 'oops');
    expect(errorSpy).toHaveBeenCalledWith('[error][export.excel]', 'oops');
  });

  it('forwards an Error instance as a separate argument so DevTools can render the stack', async () => {
    const { log } = await import('../logger');
    const err = new Error('boom');
    log.error('office-store', 'failed', err);
    expect(errorSpy).toHaveBeenCalledWith(
      '[error][office-store]',
      'failed',
      err,
    );
  });

  it('emits warn for warnings', async () => {
    const { log } = await import('../logger');
    log.warn('mod', 'soft fail');
    expect(warnSpy).toHaveBeenCalledWith('[warn][mod]', 'soft fail');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('emits info in dev mode', async () => {
    const { log } = await import('../logger');
    log.info('mod', 'event');
    expect(infoSpy).toHaveBeenCalled();
  });

  it('forwards arbitrary context objects on the same line', async () => {
    const { log } = await import('../logger');
    log.warn('api', 'unexpected response', { status: 502, body: 'bad gw' });
    expect(warnSpy).toHaveBeenCalledWith('[warn][api]', 'unexpected response', {
      status: 502,
      body: 'bad gw',
    });
  });
});
