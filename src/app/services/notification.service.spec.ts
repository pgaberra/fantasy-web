import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new NotificationService();
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
});
