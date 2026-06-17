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
  };

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
});
