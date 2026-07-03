import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { ProjectionCardComponent } from './projection-card/projection-card';

@Component({
  selector: 'app-projection-list',
  imports: [LoadingIndicatorComponent, ErrorStateComponent, ProjectionCardComponent],
  templateUrl: './projection-list.html',
  styleUrl: './projection-list.css',
})
export class ProjectionListComponent {
  private readonly storage = inject(ProjectionStorageService);
  private readonly router = inject(Router);
  private readonly notification = inject(NotificationService);

  readonly projectionsResource = rxResource({
    stream: () => this.storage.listProjections(),
    defaultValue: [],
  });

  readonly sortedProjections = computed(() =>
    [...this.projectionsResource.value()].sort((first, second) =>
      second.updatedAt.localeCompare(first.updatedAt),
    ),
  );

  retry(): void {
    this.projectionsResource.reload();
  }

  createNew(): void {
    void this.router.navigate(['/projections/new']);
  }

  edit(id: string): void {
    void this.router.navigate(['/projections', id]);
  }

  draft(id: string): void {
    void this.router.navigate(['/projections', id, 'draft']);
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.storage.deleteProjection(id))
      .then(() => {
        this.projectionsResource.reload();
      })
      .catch(() => this.notification.error("Couldn't delete the projection. Please try again."));
  }
}
