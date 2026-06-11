import { Component, input, output, signal } from '@angular/core';
import { ProjectionSummaryResponse } from '../../api/models/projection-summary-response';

@Component({
  selector: 'app-projection-manager',
  templateUrl: './projection-manager.html',
  styleUrl: './projection-manager.css',
})
export class ProjectionManagerComponent {
  readonly savedProjections = input.required<ProjectionSummaryResponse[]>();
  readonly loadedName = input<string | null>(null);
  readonly isBusy = input<boolean>(false);

  readonly loadProjection = output<string>();
  readonly save = output<void>();
  readonly saveAs = output<string>();
  readonly deleteCurrent = output<void>();

  readonly newName = signal('');

  onLoad(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) {
      this.loadProjection.emit(id);
    }
  }

  onNameInput(event: Event): void {
    this.newName.set((event.target as HTMLInputElement).value);
  }

  onSaveAs(): void {
    const name = this.newName().trim();
    if (name) {
      this.saveAs.emit(name);
      this.newName.set('');
    }
  }
}
