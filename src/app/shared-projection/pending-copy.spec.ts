import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PendingCopyService } from './pending-copy';

describe('PendingCopyService', () => {
  let service: PendingCopyService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(PendingCopyService);
  });

  it('hands back the press that was made on this board', () => {
    service.remember('abc123', 'draft');

    expect(service.take('abc123')).toBe('draft');
  });

  /** A copy is the answer to one press. A reload is not a second one. */
  it('spends the press on the first board that asks for it', () => {
    service.remember('abc123', 'projection');

    expect(service.take('abc123')).toBe('projection');
    expect(service.take('abc123')).toBeNull();
  });

  /** Pressing Draft Mode on one board is not a request to copy the next one opened. */
  it('does not carry a press from one board to another', () => {
    service.remember('abc123', 'draft');

    expect(service.take('def456')).toBeNull();
  });

  /** And the board that was not copied does not get a second chance at it later either. */
  it('spends the press even when another board asked', () => {
    service.remember('abc123', 'draft');
    service.take('def456');

    expect(service.take('abc123')).toBeNull();
  });

  it('has nothing to hand back when no button was pressed', () => {
    expect(service.take('abc123')).toBeNull();
  });

  /**
   * The value sits in the visitor's own browser, so this is not a trust boundary — but a shape
   * this code does not recognise has to leave the board on screen rather than throw on the way
   * to rendering it.
   */
  it.each([
    ['not JSON at all', 'draft'],
    ['null', 'null'],
    ['a string', '"draft"'],
    ['an action it does not offer', '{"token":"abc123","destination":"delete-everything"}'],
    ['no token', '{"destination":"draft"}'],
  ])('ignores a stored press that is %s', (_name, stored) => {
    sessionStorage.setItem('shared_copy_intent', stored);

    expect(service.take('abc123')).toBeNull();
  });
});
