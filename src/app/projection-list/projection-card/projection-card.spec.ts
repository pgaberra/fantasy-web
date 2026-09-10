import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectionCardComponent } from './projection-card';
import { ProjectionSummaryResponse } from '../../api/models/projection-summary-response';
import { PopoverTriggerDirective } from '../../shared/popover/popover-trigger.directive';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';

describe('ProjectionCardComponent', () => {
  const projection: ProjectionSummaryResponse = {
    id: 'p1',
    kind: 'projection',
    name: 'My league',
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    draftStatus: 'none',
  };

  const template = `<li app-projection-card [projection]="projection"
    [isPreparingShare]="isPreparingShare"
    (edit)="onEdit()" (share)="onShare()" (remove)="onRemove()"
    (discardDraft)="onDiscardDraft()"></li>`;

  const renderWithStatus = (draftStatus: ProjectionSummaryResponse['draftStatus']) =>
    MockRender(template, {
      projection: { ...projection, draftStatus },
      isPreparingShare: false,
      onEdit,
      onShare,
      onRemove,
      onDiscardDraft,
    });

  const onEdit = vi.fn();
  const onShare = vi.fn();
  const onRemove = vi.fn();
  const onDiscardDraft = vi.fn();

  beforeEach(() => {
    onEdit.mockClear();
    onShare.mockClear();
    onRemove.mockClear();
    onDiscardDraft.mockClear();
    return MockBuilder(ProjectionCardComponent).keep(PopoverTriggerDirective);
  });

  const render = (isPreparingShare = false) =>
    MockRender(template, {
      projection,
      isPreparingShare,
      onEdit,
      onShare,
      onRemove,
      onDiscardDraft,
    });

  /** Menu items live in the CDK overlay, outside the fixture's own DOM. */
  const menuItems = () => {
    TestBed.inject(ApplicationRef).tick();
    return [...document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container .menu-item')];
  };

  const openMenu = () => {
    ngMocks.find<HTMLButtonElement>('.card-menu').nativeElement.click();
    return menuItems();
  };

  const menuItem = (label: string) =>
    menuItems().find((item) => item.textContent?.includes(label))!;

  it('renders the projection name and last-updated label', () => {
    const fixture = render();

    expect(fixture.nativeElement.textContent).toContain('My league');
    expect(fixture.nativeElement.textContent).toContain('Updated');
  });

  it('emits edit when Edit is clicked', () => {
    render();

    ngMocks.find<HTMLButtonElement>('.edit').nativeElement.click();

    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('keeps Share and Delete behind the menu rather than on the card itself', () => {
    const fixture = render();

    expect(fixture.nativeElement.textContent).toContain('Edit');
    expect(fixture.nativeElement.textContent).not.toContain('Share');
    expect(fixture.nativeElement.textContent).not.toContain('Delete');

    const labels = openMenu().map((item) => item.textContent?.trim());
    expect(labels).toEqual(['Share', 'Delete']);
  });

  it('emits share when the menu item is chosen', () => {
    render();
    openMenu();

    menuItem('Share').dispatchEvent(new Event('click', { bubbles: true }));

    expect(onShare).toHaveBeenCalledOnce();
  });

  it('says a share is opening and blocks a second attempt while it prepares', () => {
    render(true);
    openMenu();

    // The busy label is drawn by the indicator now, so the menu item carries no text of its own.
    const pending = ngMocks.find(LoadingIndicatorComponent);
    expect(ngMocks.input(pending, 'label')).toEqual('Opening');
    expect((pending.nativeElement.closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks for confirmation before removing, then emits on confirm', () => {
    const fixture = render();
    openMenu();

    menuItem('Delete').dispatchEvent(new Event('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Delete “My league”?');
    expect(onRemove).not.toHaveBeenCalled();

    ngMocks.find<HTMLButtonElement>('.delete').nativeElement.click();

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('puts focus on the question, not on the button that would delete', () => {
    const fixture = render();
    openMenu();

    menuItem('Delete').dispatchEvent(new Event('click', { bubbles: true }));
    fixture.detectChanges();

    // Choosing Delete destroys the menu focus was in, so the confirmation has to take it —
    // but landing on "Yes, delete" would let the keypress that opened the item confirm too.
    expect(document.activeElement).toEqual(ngMocks.find('.confirm-text').nativeElement);
  });

  it('does not remove when the confirmation is cancelled', () => {
    const fixture = render();
    openMenu();

    menuItem('Delete').dispatchEvent(new Event('click', { bubbles: true }));
    fixture.detectChanges();
    ngMocks.find<HTMLButtonElement>('.cancel').nativeElement.click();
    fixture.detectChanges();

    expect(onRemove).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Edit');
  });

  it('labels the draft action "Draft mode" and shows no status pill without a draft', () => {
    const fixture = renderWithStatus('none');

    expect(ngMocks.find<HTMLButtonElement>('.draft').nativeElement.textContent).toContain(
      'Draft mode',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Draft in progress');
    expect(fixture.nativeElement.textContent).not.toContain('Draft complete');
  });

  it('labels the draft action "Resume draft" and shows an in-progress pill', () => {
    const fixture = renderWithStatus('in_progress');

    expect(ngMocks.find<HTMLButtonElement>('.draft').nativeElement.textContent).toContain(
      'Resume draft',
    );
    expect(fixture.nativeElement.textContent).toContain('Draft in progress');
  });

  it('labels the draft action "View summary" and shows a complete pill when finished', () => {
    const fixture = renderWithStatus('finished');

    expect(ngMocks.find<HTMLButtonElement>('.draft').nativeElement.textContent).toContain(
      'View summary',
    );
    expect(fixture.nativeElement.textContent).toContain('Draft complete');
  });

  describe('a board imported from a share link', () => {
    const imported: ProjectionSummaryResponse = {
      ...projection,
      kind: 'imported',
      name: "Alex's board",
      origin: { shareToken: 'abc123', authorUsername: 'alex' },
    };

    const renderImported = () =>
      MockRender(template, {
        projection: imported,
        isPreparingShare: false,
        onEdit,
        onShare,
        onRemove,
      });

    it('says whose numbers it holds', () => {
      const fixture = renderImported();

      expect(fixture.nativeElement.textContent).toContain('From alex');
    });

    /** A share credits the account that publishes it; this board is not theirs to publish. */
    it('does not offer to share it', () => {
      const fixture = renderImported();
      fixture.nativeElement.querySelector('.card-menu')?.click();
      fixture.detectChanges();

      expect(document.querySelector('.menu-item.share')).toBeNull();
    });

    it('still offers to edit and to delete it', () => {
      const fixture = renderImported();

      expect(fixture.nativeElement.querySelector('.edit')).not.toBeNull();
      fixture.nativeElement.querySelector('.card-menu')?.click();
      fixture.detectChanges();
      expect(document.querySelector('.menu-item.delete')).not.toBeNull();
    });
  });

  it('offers to discard the draft, but only once one has been played', () => {
    renderWithStatus('none');
    expect(openMenu().map((item) => item.textContent?.trim())).toEqual(['Share', 'Delete']);

    renderWithStatus('in_progress');
    expect(openMenu().map((item) => item.textContent?.trim())).toEqual([
      'Share',
      'Discard draft',
      'Delete',
    ]);

    // A finished draft is worth throwing away too: it is what stands between the board and
    // being drafted afresh.
    renderWithStatus('finished');
    expect(openMenu().map((item) => item.textContent?.trim())).toEqual([
      'Share',
      'Discard draft',
      'Delete',
    ]);
  });

  it('asks before discarding, naming the board so it is not read as a delete', () => {
    const fixture = renderWithStatus('finished');
    openMenu();

    menuItem('Discard draft').dispatchEvent(new Event('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Discard the draft for “My league”?');
    expect(onDiscardDraft).not.toHaveBeenCalled();
    expect(document.activeElement).toEqual(ngMocks.find('.confirm-text').nativeElement);

    ngMocks.find<HTMLButtonElement>('.discard').nativeElement.click();

    expect(onDiscardDraft).toHaveBeenCalledOnce();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('does not discard when the confirmation is cancelled', () => {
    const fixture = renderWithStatus('finished');
    openMenu();

    menuItem('Discard draft').dispatchEvent(new Event('click', { bubbles: true }));
    fixture.detectChanges();
    ngMocks.find<HTMLButtonElement>('.cancel').nativeElement.click();
    fixture.detectChanges();

    expect(onDiscardDraft).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Edit');
  });
});
