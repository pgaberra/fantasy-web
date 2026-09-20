import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { ProjectionResponse } from '../../api/models/projection-response';
import { ProjectionImportComponent } from './projection-import';
import { ShareImportComponent } from '../share-import/share-import';
import { SpreadsheetImportButtonComponent } from '../spreadsheet-import/spreadsheet-import-button';

describe('ProjectionImportComponent', () => {
  const originalFlag = environment.spreadsheetImportEnabled;

  beforeEach(() => {
    environment.spreadsheetImportEnabled = true;
    return MockBuilder(ProjectionImportComponent)
      .mock(ShareImportComponent)
      .mock(SpreadsheetImportButtonComponent);
  });

  afterEach(() => {
    environment.spreadsheetImportEnabled = originalFlag;
  });

  const render = () => MockRender(ProjectionImportComponent).nativeElement;

  it('offers following a link and uploading a spreadsheet as alternatives', () => {
    const root = render();

    expect(root.querySelector('app-share-import')).not.toBeNull();
    expect(root.querySelector('.or')?.textContent?.trim()).toEqual('or');
    expect(root.querySelector('app-spreadsheet-import-button')).not.toBeNull();
  });

  /** An "or" with nothing after it separates the field from the bottom of the panel. */
  it('drops the separator with the spreadsheet import off', () => {
    environment.spreadsheetImportEnabled = false;

    const root = render();

    expect(root.querySelector('.or')).toBeNull();
    expect(root.querySelector('app-spreadsheet-import-button')).toBeNull();
    expect(root.querySelector('app-share-import')).not.toBeNull();
  });

  it('hands the page whichever board came in', () => {
    const fixture = MockRender(ProjectionImportComponent);
    const imported = vi.fn();
    fixture.point.componentInstance.imported.subscribe(imported);
    const board = { id: 'b1' } as ProjectionResponse;

    ngMocks.findInstance(ShareImportComponent).followed.emit(board);
    ngMocks.findInstance(SpreadsheetImportButtonComponent).imported.emit(board);

    expect(imported).toHaveBeenCalledTimes(2);
    expect(imported).toHaveBeenCalledWith(board);
  });
});
