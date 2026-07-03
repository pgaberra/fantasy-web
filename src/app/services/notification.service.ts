import { Injectable, signal } from '@angular/core';

export interface AppNotification {
  readonly id: number;
  readonly message: string;
  readonly type: 'error';
}

const AUTO_DISMISS_MS = 7000;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 0;
  private readonly active = signal<AppNotification[]>([]);
  readonly notifications = this.active.asReadonly();

  error(message: string): void {
    const id = this.nextId++;
    this.active.update((list) => [...list, { id, message, type: 'error' }]);
    setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS);
  }

  dismiss(id: number): void {
    this.active.update((list) => list.filter((notification) => notification.id !== id));
  }
}
