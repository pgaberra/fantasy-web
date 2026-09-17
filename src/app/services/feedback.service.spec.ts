import { TestBed } from '@angular/core/testing';
import { MockBuilder } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../api/api';
import { sendFeedback } from '../api/fn/feedback/send-feedback';
import { FeedbackService, feedbackPage } from './feedback.service';

describe('FeedbackService', () => {
  const invoke = vi.fn();

  beforeEach(() => {
    invoke.mockReset();
    return MockBuilder(FeedbackService).mock(Api, { invoke });
  });

  it('sends the report to the BFF', async () => {
    invoke.mockResolvedValue(undefined);
    const request = { type: 'BUG' as const, title: 't', description: 'd', page: '/draft' };

    await TestBed.inject(FeedbackService).send(request);

    expect(invoke).toHaveBeenCalledWith(sendFeedback, { body: request });
  });
});

describe('feedbackPage', () => {
  it('keeps a plain path', () => {
    expect(feedbackPage('/projections/42')).toEqual('/projections/42');
  });

  // A reset or verification link carries its token in the query string, and the BFF refuses a
  // page that has one rather than file it.
  it('drops the query string and the fragment', () => {
    expect(feedbackPage('/reset-password?token=live#top')).toEqual('/reset-password');
  });

  it.each([
    null,
    undefined,
    '',
    'https://slapstat.com/draft',
    '/draft board',
    `/${'a'.repeat(200)}`,
  ])('gives up on %s rather than send something the BFF refuses', (url) => {
    expect(feedbackPage(url)).toBeUndefined();
  });
});
