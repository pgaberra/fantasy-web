import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatToi',
  standalone: true,
})
export class FormatToiPipe implements PipeTransform {
  transform(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
}
