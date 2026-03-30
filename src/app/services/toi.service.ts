import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ToiService {
  parseToi(toi: string): number {
    if (!toi || !toi.trim()) return 0;
    const colonMatch = toi.match(/^(\d+):(\d{1,2})$/);
    if (colonMatch) {
      const minutes = parseInt(colonMatch[1], 10);
      const seconds = parseInt(colonMatch[2], 10);
      if (seconds < 60) {
        return minutes * 60 + seconds;
      }
      return 0;
    }
    const result = Number(toi);
    return isNaN(result) ? 0 : result;
  }
}
