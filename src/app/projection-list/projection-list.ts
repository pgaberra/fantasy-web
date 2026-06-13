import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ProjectionCardComponent } from './projection-card/projection-card';

@Component({
  selector: 'app-projection-list',
  imports: [LoadingIndicatorComponent, ProjectionCardComponent],
  templateUrl: './projection-list.html',
  styleUrl: './projection-list.css',
})
export class ProjectionListComponent {
  private readonly storage = inject(ProjectionStorageService);
  private readonly router = inject(Router);

  readonly projectionsResource = rxResource({
    stream: () => this.storage.listProjections(),
    defaultValue: [],
  });

  createNew(): void {
    void this.router.navigate(['/projections/new']);
  }

  edit(id: string): void {
    void this.router.navigate(['/projections', id]);
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.storage.deleteProjection(id))
      .then(() => {
        this.projectionsResource.reload();
      })
      .catch(() => undefined);
  }
}
