import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ToiService {
  parseToi(toi: string): number {
    const parts = toi.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      if (!isNaN(minutes) && !isNaN(seconds)) {
        return minutes * 60 + seconds;
      }
    }
    return Number(toi);
  }
}
