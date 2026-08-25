import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectionCardComponent } from './projection-card';
import { ProjectionSummaryResponse } from '../../api/models/projection-summary-response';
import { PopoverTriggerDirective } from '../../shared/popover/popover-trigger.directive';

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
    (edit)="onEdit()" (share)="onShare()" (remove)="onRemove()"></li>`;

  const renderWithStatus = (draftStatus: ProjectionSummaryResponse['draftStatus']) =>
    MockRender(template, {
      projection: { ...projection, draftStatus },
      isPreparingShare: false,
      onEdit,
      onShare,
      onRemove,
    });

  const onEdit = vi.fn();
  const onShare = vi.fn();
  const onRemove = vi.fn();

  beforeEach(() => {
    onEdit.mockClear();
    onShare.mockClear();
    onRemove.mockClear();
    return MockBuilder(ProjectionCardComponent).keep(PopoverTriggerDirective);
  });

  const render = (isPreparingShare = false) =>
    MockRender(template, { projection, isPreparingShare, onEdit, onShare, onRemove });

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

    const share = menuItem('Opening…');
    expect(share.disabled).toBe(true);
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
});
