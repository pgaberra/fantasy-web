import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { NotificationService } from '../services/notification.service';
import {
  clearStaleBuildReload,
  handleNavigationError,
  isRecoveringFromStaleBuild,
  isStaleBuildError,
} from './navigation-error';

describe('isStaleBuildError', () => {
  it.each([
    'ChunkLoadError: Loading chunk 42 failed',
    'Failed to fetch dynamically imported module: https://slapstat.com/chunk-ABC.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
  ])('recognises %s', (message) => {
    expect(isStaleBuildError(new Error(message))).toEqual(true);
  });

  it('does not claim an unrelated failure', () => {
    expect(isStaleBuildError(new Error('Cannot read properties of undefined'))).toEqual(false);
  });
});

describe('handleNavigationError', () => {
  let error: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    error = vi.fn();
    reload = vi.fn();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: NotificationService, useValue: { error } }],
    });
    injector = TestBed.inject(EnvironmentInjector);
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      reload,
    } as unknown as Location);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  const handle = (thrown: unknown) =>
    runInInjectionContext(injector, () => handleNavigationError(thrown));

  /** A tab open across a deploy asks for chunks that no longer exist. Reloading is the fix. */
  it('reloads once when the build the tab is running has gone', () => {
    handle(new Error('Failed to fetch dynamically imported module'));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('does not reload a second time — a broken build is not a stale one', () => {
    handle(new Error('ChunkLoadError'));
    handle(new Error('ChunkLoadError'));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('allows another reload once a navigation has succeeded since', () => {
    handle(new Error('ChunkLoadError'));
    clearStaleBuildReload();
    handle(new Error('ChunkLoadError'));

    expect(reload).toHaveBeenCalledTimes(2);
  });

  /**
   * The router rethrows the error after this handler has run, so the global ErrorHandler has to
   * be able to tell the reload it just scheduled from a failure nobody is dealing with.
   */
  it('owns the error it has scheduled a reload for', () => {
    const thrown = new Error('Failed to fetch dynamically imported module');
    expect(isRecoveringFromStaleBuild(thrown)).toEqual(false);

    handle(thrown);

    expect(isRecoveringFromStaleBuild(thrown)).toEqual(true);
  });

  it('does not claim an unrelated error just because a reload is pending', () => {
    handle(new Error('ChunkLoadError'));

    expect(isRecoveringFromStaleBuild(new Error('Cannot read properties of undefined'))).toEqual(
      false,
    );
  });

  it('stops owning the error once a navigation has succeeded since', () => {
    handle(new Error('ChunkLoadError'));
    clearStaleBuildReload();

    expect(isRecoveringFromStaleBuild(new Error('ChunkLoadError'))).toEqual(false);
  });

  it('tells the user when a navigation fails for any other reason', () => {
    handle(new Error('Cannot read properties of undefined'));

    expect(reload).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("Couldn't open that page. Please try again.");
  });
});
