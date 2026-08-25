import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ProjectionSummaryResponse } from '../../api/models/projection-summary-response';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { PopoverTriggerDirective } from '../../shared/popover/popover-trigger.directive';

@Component({
  selector: 'li[app-projection-card]',
  imports: [RelativeTimePipe, PopoverTriggerDirective],
  templateUrl: './projection-card.html',
  styleUrl: './projection-card.css',
})
export class ProjectionCardComponent {
  readonly projection = input.required<ProjectionSummaryResponse>();
  // Sharing has to fetch and rank before the dialog can open, which is long enough to
  // need saying so on the button.
  readonly isPreparingShare = input<boolean>(false);
  readonly edit = output<void>();
  readonly draft = output<void>();
  readonly share = output<void>();
  readonly remove = output<void>();

  private readonly confirmPrompt = viewChild<ElementRef<HTMLElement>>('confirmPrompt');

  readonly draftLabel = computed(() => {
    switch (this.projection().draftStatus) {
      case 'finished':
        return 'View summary';
      case 'in_progress':
        return 'Resume draft';
      default:
        return 'Draft mode';
    }
  });

  readonly confirmingDelete = signal(false);

  constructor() {
    // Delete lives in the overflow menu, and choosing it destroys the trigger the menu hangs
    // off — so the confirmation would otherwise appear with focus dropped on the body. The
    // prompt takes focus rather than "Yes, delete": the same keypress that picked the menu
    // item must not be able to carry through and confirm the deletion.
    effect(() => {
      if (this.confirmingDelete()) {
        this.confirmPrompt()?.nativeElement.focus();
      }
    });
  }

  startDelete(): void {
    this.confirmingDelete.set(true);
  }

  cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  confirmDelete(): void {
    this.confirmingDelete.set(false);
    this.remove.emit();
  }
}
