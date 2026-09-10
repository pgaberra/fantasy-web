import { inject, Injectable } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { ProjectionResponse } from '../api/models/projection-response';
import { ProjectionStorageService } from './projection-storage.service';

/**
 * Boards downloaded once for as long as a page is open, so picking through a list of them and
 * back costs one fetch each — and so the page that both previews a board and then acts on it
 * (the new-projection page previews a copy and creates from it) pays for it once rather than
 * twice, which is what it cost before there was a preview.
 *
 * <p>Deliberately <em>not</em> {@code providedIn: 'root'}: a board edited in the editor and
 * looked at again afterwards has to come back changed. Each page that wants one lists it in its
 * own {@code providers}, which ties the cache's life to that page's, and the preview component
 * inside it shares that instance.
 */
@Injectable()
export class ProjectionBoardCache {
  private readonly storage = inject(ProjectionStorageService);
  private readonly boards = new Map<string, ProjectionResponse>();

  load(id: string): Observable<ProjectionResponse> {
    const held = this.boards.get(id);
    return held
      ? of(held)
      : this.storage.loadProjection(id).pipe(tap((loaded) => this.boards.set(id, loaded)));
  }
}
