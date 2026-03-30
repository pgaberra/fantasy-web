import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatToi',
  standalone: true,
})
export class FormatToiPipe implements PipeTransform {
  transform(totalSeconds: number): string {
    const safeTotalSeconds = isNaN(totalSeconds) ? 0 : totalSeconds;
    const minutes = Math.floor(safeTotalSeconds / 60);
    const seconds = safeTotalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
}
