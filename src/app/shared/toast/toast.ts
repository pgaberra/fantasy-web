import { Component, inject } from '@angular/core';
import { NotificationService } from '../../services/notification.service';
import { IconComponent } from '../icon/icon';

@Component({
  selector: 'app-toast',
  imports: [IconComponent],
  templateUrl: './toast.html',
  styleUrl: './toast.css',
})
export class ToastComponent {
  private readonly notificationService = inject(NotificationService);

  readonly notifications = this.notificationService.notifications;

  dismiss(id: number): void {
    this.notificationService.dismiss(id);
  }
}
