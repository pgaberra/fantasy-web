import { Injectable, inject } from '@angular/core';
import { Api } from '../api/api';
import { sendFeedback } from '../api/fn/feedback/send-feedback';
import { SendFeedbackRequest } from '../api/models/send-feedback-request';

/** The caps the BFF enforces on a feedback request, mirrored so the form can say so first. */
export const FEEDBACK_TITLE_MAX_LENGTH = 120;
export const FEEDBACK_DESCRIPTION_MAX_LENGTH = 5000;
const FEEDBACK_PAGE_MAX_LENGTH = 200;
const FEEDBACK_PAGE_PATTERN = /^\/[A-Za-z0-9/_.~%-]*$/;

/**
 * The path a report is about, from a URL the app was on. Only the path: a query string or a
 * fragment can carry a single-use token, and the BFF refuses anything else rather than file it.
 */
export function feedbackPage(url: string | null | undefined): string | undefined {
  const path = url?.split(/[?#]/)[0];
  if (!path || path.length > FEEDBACK_PAGE_MAX_LENGTH || !FEEDBACK_PAGE_PATTERN.test(path)) {
    return undefined;
  }
  return path;
}

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly api = inject(Api);

  send(request: SendFeedbackRequest): Promise<void> {
    return this.api.invoke(sendFeedback, { body: request });
  }
}
