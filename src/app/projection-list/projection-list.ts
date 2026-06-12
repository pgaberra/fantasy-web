import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ProjectionCardComponent } from './projection-card/projection-card';

@Component({
  selector: 'app-projection-list',
  imports: [LoadingIndicatorComponent, ProjectionCardComponent],
  templateUrl: './projection-list.html',
  styleUrl: './projection-list.css',
})
export class ProjectionListComponent implements OnInit {
  private readonly storage = inject(ProjectionStorageService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly projections = signal<ProjectionSummaryResponse[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly newName = signal<string>('');

  ngOnInit(): void {
    this.refresh();
  }

  private refresh(): void {
    this.isLoading.set(true);
    this.storage
      .listProjections()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projections) => {
          this.projections.set(projections);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
  }

  onNameInput(event: Event): void {
    this.newName.set((event.target as HTMLInputElement).value);
  }

  createNew(): void {
    const name = this.newName().trim();
    if (!name) {
      return;
    }
    void this.router.navigate(['/projections/new'], { state: { name } });
  }

  edit(id: string): void {
    void this.router.navigate(['/projections', id]);
  }

  remove(id: string): void {
    this.storage
      .deleteProjection(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.refresh(),
        error: () => undefined,
      });
  }
}
