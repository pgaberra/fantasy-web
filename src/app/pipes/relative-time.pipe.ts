import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'relativeTime',
  standalone: true,
})
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      return '';
    }

    const seconds = Math.round((Date.now() - timestamp) / 1000);
    if (seconds < 45) {
      return 'just now';
    }

    const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return relative.format(-minutes, 'minute');
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return relative.format(-hours, 'hour');
    }
    const days = Math.round(hours / 24);
    if (days < 7) {
      return relative.format(-days, 'day');
    }

    return new Date(timestamp).toLocaleDateString('en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
