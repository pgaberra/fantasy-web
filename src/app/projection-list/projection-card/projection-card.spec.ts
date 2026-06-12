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

  it('renders the projection name and season', () => {
    const fixture = render();

    expect(fixture.nativeElement.textContent).toContain('My league');
    expect(fixture.nativeElement.textContent).toContain('20262027');
  });

  it('emits edit and remove when the buttons are clicked', () => {
    render();

    const buttons = ngMocks.findAll<HTMLButtonElement>('button');
    buttons[0].nativeElement.click();
    buttons[1].nativeElement.click();

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
