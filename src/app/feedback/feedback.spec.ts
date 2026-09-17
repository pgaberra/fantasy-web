import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountService } from '../services/account.service';
import { FeedbackService } from '../services/feedback.service';
import { FeedbackComponent } from './feedback';

describe('FeedbackComponent', () => {
  const send = vi.fn();

  const setup = (from: string | null = '/draft') => {
    send.mockReset();
    send.mockResolvedValue(undefined);
    return MockBuilder(FeedbackComponent)
      .provide({ provide: FeedbackService, useValue: { send } })
      .provide({ provide: AccountService, useValue: { email: signal('manager@example.com') } })
      .provide({
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(from ? { from } : {}) } },
      });
  };

  const fill = (title: string, description: string) => {
    const fixture = MockRender(FeedbackComponent);
    const component = fixture.point.componentInstance;
    component.feedbackForm.title().value.set(title);
    component.feedbackForm.description().value.set(description);
    fixture.detectChanges();
    return { fixture, component };
  };

  const submitted = async ({ fixture, component }: ReturnType<typeof fill>) => {
    component.onSubmit(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    return component;
  };

  describe('from a page', () => {
    beforeEach(() => setup('/draft'));

    it('says where the reply will go', () => {
      MockRender(FeedbackComponent);

      expect((ngMocks.find('.auth-subtitle').nativeElement as HTMLElement).textContent).toContain(
        'manager@example.com',
      );
    });

    it('asks for the bug or the feature, whichever is picked', () => {
      const fixture = MockRender(FeedbackComponent);
      const placeholder = () =>
        (ngMocks.find('#description').nativeElement as HTMLTextAreaElement).placeholder;

      expect(placeholder()).toEqual('Describe the bug you encountered.');

      fixture.point.componentInstance.setType('FEATURE');
      fixture.detectChanges();

      expect(placeholder()).toEqual('Describe the feature you want us to implement.');
    });

    it('sends a bug report with the page it came from', async () => {
      const component = await submitted(fill('Board freezes', 'It froze on pick 3.'));

      expect(send).toHaveBeenCalledWith({
        type: 'BUG',
        title: 'Board freezes',
        description: 'It froze on pick 3.',
        page: '/draft',
      });
      expect(component.submitted()).toEqual(true);
    });

    it('sends a feature request when that is picked', async () => {
      const filled = fill('Dark mode', 'Please.');
      filled.component.setType('FEATURE');

      await submitted(filled);

      expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'FEATURE' }));
    });

    it('does not send without a summary and details', async () => {
      const component = await submitted(fill('', ''));

      expect(send).not.toHaveBeenCalled();
      expect(component.submitted()).toEqual(false);
    });

    it('does not send a summary over the cap the BFF enforces', async () => {
      await submitted(fill('x'.repeat(121), 'd'));

      expect(send).not.toHaveBeenCalled();
    });

    // What the reader typed stays in the form, so a retry costs them nothing.
    it('keeps the message and says it was not sent when the BFF fails', async () => {
      send.mockRejectedValue(new HttpErrorResponse({ status: 400 }));

      const component = await submitted(fill('Board freezes', 'It froze.'));

      expect(component.submitted()).toEqual(false);
      expect(component.errorMessage()).toEqual(
        "Couldn't send your feedback. Try again in a moment.",
      );
      expect(component.feedbackForm.description().value()).toEqual('It froze.');
    });

    it('starts over empty for another report', async () => {
      const component = await submitted(fill('Board freezes', 'It froze.'));

      component.sendAnother();

      expect(component.submitted()).toEqual(false);
      expect(component.feedbackForm.title().value()).toEqual('');
    });
  });

  describe('with a page that carries a query string', () => {
    beforeEach(() => setup('/reset-password?token=live'));

    it('sends only the path', async () => {
      await submitted(fill('Reset link', 'It expired.'));

      expect(send).toHaveBeenCalledWith(expect.objectContaining({ page: '/reset-password' }));
    });
  });
});
