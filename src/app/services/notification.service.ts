import { Injectable, inject, signal } from '@angular/core';
import { ErrorReportingService } from './error-reporting.service';

export interface AppNotification {
  readonly id: number;
  readonly message: string;
  readonly type: 'error' | 'success';
}

const AUTO_DISMISS_MS = 7000;
/** Shorter than a failure's: a confirmation is read at a glance, and nothing needs doing about it. */
const SUCCESS_DISMISS_MS = 4000;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly reporting = inject(ErrorReportingService);

  private nextId = 0;
  private readonly active = signal<AppNotification[]>([]);
  readonly notifications = this.active.asReadonly();

  /**
   * Every discrete user action that failed comes through here, which makes it the one place that
   * knows about them. Telling the user and telling ourselves are the same event, so it reports as
   * well as renders — an unreported failure is one we learn about from an email, if at all.
   *
   * `context` goes to the report only, never on screen: the user reads the sentence, we need
   * whatever the sentence was written about.
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.reporting.reportMessage(message, context);
    this.show(message, 'error', AUTO_DISMISS_MS);
  }

  /**
   * Confirms an action that worked, for the moment after the press only: what stays true
   * afterwards belongs on the page itself (the button that now says Unfollow), not in a line of
   * text that outlives the moment. Not reported, since nothing went wrong.
   */
  success(message: string): void {
    this.show(message, 'success', SUCCESS_DISMISS_MS);
  }

  private show(message: string, type: AppNotification['type'], dismissAfterMs: number): void {
    const id = this.nextId++;
    this.active.update((list) => [...list, { id, message, type }]);
    setTimeout(() => this.dismiss(id), dismissAfterMs);
  }

  dismiss(id: number): void {
    this.active.update((list) => list.filter((notification) => notification.id !== id));
  }
}
