import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';
import { ErrorReportingService } from './error-reporting.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let reportMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    reportMessage = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: ErrorReportingService, useValue: { reportMessage } }],
    });
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no notifications', () => {
    expect(service.notifications()).toEqual([]);
  });

  it('adds an error notification with the given message', () => {
    service.error('Something broke');

    const active = service.notifications();
    expect(active.length).toEqual(1);
    expect(active[0].message).toEqual('Something broke');
    expect(active[0].type).toEqual('error');
  });

  it('gives each notification a unique id', () => {
    service.error('First');
    service.error('Second');

    const ids = service.notifications().map((notification) => notification.id);
    expect(new Set(ids).size).toEqual(2);
  });

  it('auto-dismisses a notification after the timeout', () => {
    service.error('Temporary');
    expect(service.notifications().length).toEqual(1);

    vi.advanceTimersByTime(7000);

    expect(service.notifications()).toEqual([]);
  });

  it('dismisses a specific notification by id', () => {
    service.error('Keep me');
    service.error('Remove me');
    const removeId = service.notifications()[1].id;

    service.dismiss(removeId);

    const remaining = service.notifications();
    expect(remaining.length).toEqual(1);
    expect(remaining[0].message).toEqual('Keep me');
  });
  // Telling the user and telling ourselves are the same event: a failure nobody reported is
  // the one we hear about from an email a day later, if at all.
  it('reports the failure as well as showing it', () => {
    service.error("Couldn't save your projection");

    expect(reportMessage).toHaveBeenCalledWith("Couldn't save your projection", undefined);
  });

  it('sends the context to the report and keeps it off the screen', () => {
    service.error("Couldn't open that page", { cause: 'ChunkLoadError' });

    expect(reportMessage).toHaveBeenCalledWith("Couldn't open that page", {
      cause: 'ChunkLoadError',
    });
    expect(service.notifications()[0].message).toEqual("Couldn't open that page");
  });

  it('adds a success notification, and reports nothing', () => {
    service.success('Added to My Projections.');

    expect(service.notifications()).toEqual([
      { id: expect.any(Number), message: 'Added to My Projections.', type: 'success' },
    ]);
    expect(reportMessage).not.toHaveBeenCalled();
  });

  it('dismisses a success sooner than a failure', () => {
    service.success('Done');
    service.error('Broke');

    vi.advanceTimersByTime(4000);

    expect(service.notifications().map((notification) => notification.type)).toEqual(['error']);
  });
});
