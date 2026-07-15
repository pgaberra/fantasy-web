import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectionCardComponent } from './projection-card';
import { ProjectionSummaryResponse } from '../../api/models/projection-summary-response';

describe('ProjectionCardComponent', () => {
  const projection: ProjectionSummaryResponse = {
    id: 'p1',
    name: 'My league',
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    draftStatus: 'none',
  };

  const renderWithStatus = (draftStatus: ProjectionSummaryResponse['draftStatus']) =>
    MockRender(
      `<li app-projection-card [projection]="projection" (edit)="onEdit()" (remove)="onRemove()"></li>`,
      { projection: { ...projection, draftStatus }, onEdit, onRemove },
    );

  const onEdit = vi.fn();
  const onRemove = vi.fn();

  beforeEach(() => {
    onEdit.mockClear();
    onRemove.mockClear();
    return MockBuilder(ProjectionCardComponent);
  });

  const render = () =>
    MockRender(
      `<li app-projection-card [projection]="projection" (edit)="onEdit()" (remove)="onRemove()"></li>`,
      { projection, onEdit, onRemove },
    );

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

  it('asks for confirmation before removing, then emits on confirm', () => {
    const fixture = render();

    ngMocks.find<HTMLButtonElement>('.delete').nativeElement.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Delete “My league”?');
    expect(onRemove).not.toHaveBeenCalled();

    ngMocks.find<HTMLButtonElement>('.delete').nativeElement.click();

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('does not remove when the confirmation is cancelled', () => {
    const fixture = render();

    ngMocks.find<HTMLButtonElement>('.delete').nativeElement.click();
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
