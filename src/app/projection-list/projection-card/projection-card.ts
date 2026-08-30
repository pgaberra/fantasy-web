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
  readonly discardDraft = output<void>();

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

  readonly origin = computed(() => this.projection().origin ?? null);

  /** Nothing to throw away until a draft has been played against this board. */
  readonly hasDraft = computed(() => this.projection().draftStatus !== 'none');

  /**
   * A copy of someone else's board is not the user's to publish: a share credits the account
   * that published it, so re-sharing an imported board would put their name on work that is
   * not theirs. Editing it is fine — that is the point of the copy — this is only about
   * republishing it as their own.
   */
  readonly canShare = computed(() => !this.origin());

  readonly confirmingDelete = signal(false);
  readonly confirmingDiscard = signal(false);

  constructor() {
    // Both destructive actions live in the overflow menu, and choosing one destroys the
    // trigger the menu hangs off — so the confirmation would otherwise appear with focus
    // dropped on the body. The prompt takes focus rather than the "Yes" beside it: the same
    // keypress that picked the menu item must not be able to carry through and confirm.
    effect(() => {
      if (this.confirmingDelete() || this.confirmingDiscard()) {
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

  startDiscard(): void {
    this.confirmingDiscard.set(true);
  }

  cancelDiscard(): void {
    this.confirmingDiscard.set(false);
  }

  confirmDiscard(): void {
    this.confirmingDiscard.set(false);
    this.discardDraft.emit();
  }
}
