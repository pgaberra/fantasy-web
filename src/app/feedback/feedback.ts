import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormField, form, maxLength, required, schema, submit } from '@angular/forms/signals';
import { AccountService } from '../services/account.service';
import {
  FEEDBACK_DESCRIPTION_MAX_LENGTH,
  FEEDBACK_TITLE_MAX_LENGTH,
  FeedbackService,
  feedbackPage,
} from '../services/feedback.service';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { messageForError } from '../shared/http-error';

type FeedbackType = 'BUG' | 'FEATURE';

@Component({
  selector: 'app-feedback',
  imports: [FormField, RouterLink, LoadingIndicatorComponent],
  templateUrl: './feedback.html',
  styleUrls: ['../auth/auth-page.css', './feedback.css'],
})
export class FeedbackComponent {
  private readonly feedbackService = inject(FeedbackService);
  readonly email = inject(AccountService).email;

  /** Where the footer link was clicked, which is the page a bug report is most likely about. */
  readonly page = feedbackPage(inject(ActivatedRoute).snapshot.queryParamMap.get('from'));

  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly submitted = signal(false);

  private readonly model = signal<{ type: FeedbackType; title: string; description: string }>({
    type: 'BUG',
    title: '',
    description: '',
  });

  readonly feedbackForm = form(
    this.model,
    schema((fields) => {
      required(fields.title, { message: 'Summary is required.' });
      maxLength(fields.title, FEEDBACK_TITLE_MAX_LENGTH, {
        message: `Summary is limited to ${FEEDBACK_TITLE_MAX_LENGTH} characters.`,
      });
      required(fields.description, { message: 'Details are required.' });
      maxLength(fields.description, FEEDBACK_DESCRIPTION_MAX_LENGTH, {
        message: 'Details are limited to 5,000 characters.',
      });
    }),
  );

  setType(type: FeedbackType) {
    this.model.update((model) => ({ ...model, type }));
  }

  onSubmit(event: Event) {
    event.preventDefault();
    void submit(this.feedbackForm, async () => {
      this.isLoading.set(true);
      this.errorMessage.set(null);
      const { type, title, description } = this.model();
      try {
        await this.feedbackService.send({ type, title, description, page: this.page });
        this.submitted.set(true);
      } catch (error) {
        this.errorMessage.set(
          error instanceof HttpErrorResponse && error.status === 404
            ? "Feedback isn't available yet."
            : messageForError(error, "Couldn't send your feedback. Try again in a moment."),
        );
      } finally {
        this.isLoading.set(false);
      }
    });
  }

  sendAnother() {
    this.model.set({ type: 'BUG', title: '', description: '' });
    this.feedbackForm().reset();
    this.submitted.set(false);
  }
}
