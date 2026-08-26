import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatToi',
  standalone: true,
})
export class FormatToiPipe implements PipeTransform {
  /**
   * Rounded to the second, because not every source of a time on ice is a whole number of them:
   * a leaderboard's TOI/G is a total divided by the games played, so twenty games of 22150
   * seconds arrives as 1107.5 and would otherwise be shown as `18:27.5`.
   */
  transform(totalSeconds: number): string {
    const safeTotalSeconds = isNaN(totalSeconds) ? 0 : Math.round(totalSeconds);
    const minutes = Math.floor(safeTotalSeconds / 60);
    const seconds = safeTotalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
}
