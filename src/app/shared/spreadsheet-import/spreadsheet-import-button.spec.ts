import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AnalyticsService } from '../../services/analytics.service';
import { NotificationService } from '../../services/notification.service';
import { PlayerService } from '../../services/player.service';
import { ProjectionStorageService } from '../../services/projection-storage.service';
import { ProjectionSerializerService } from '../../services/projection-serializer.service';
import { StatInfoService } from '../../services/stat-info.service';
import { SkaterProjection } from '../../models/projection.model';
import { SpreadsheetImportButtonComponent } from './spreadsheet-import-button';
import { ImportPlan } from './spreadsheet-import';
import { POOL } from './spreadsheet-test-players';

describe('SpreadsheetImportButtonComponent', () => {
  const getPlayers = vi.fn();
  const createProjection = vi.fn();
  const notifyError = vi.fn();
  const capture = vi.fn();
  const originalFlag = environment.spreadsheetImportEnabled;

  beforeEach(() => {
    environment.spreadsheetImportEnabled = true;
    getPlayers.mockReset().mockReturnValue(of(POOL));
    createProjection.mockReset().mockReturnValue(of({ id: 'new-board' }));
    notifyError.mockReset();
    capture.mockReset();
    return MockBuilder(SpreadsheetImportButtonComponent)
      .keep(ProjectionSerializerService)
      .keep(StatInfoService)
      .mock(PlayerService, { getPlayers })
      .mock(ProjectionStorageService, { createProjection })
      .mock(NotificationService, { error: notifyError })
      .mock(AnalyticsService, { capture });
  });

  afterEach(() => {
    environment.spreadsheetImportEnabled = originalFlag;
  });

  const plan = (stats: ImportPlan['stats']): ImportPlan => ({
    stats,
    notFound: ['Nobody'],
    ambiguous: [],
    respelled: [],
    duplicates: [],
    rowCount: stats.size + 1,
  });

  it('draws nothing while the build has the import switched off', () => {
    environment.spreadsheetImportEnabled = false;
    const fixture = MockRender(SpreadsheetImportButtonComponent);
    expect(ngMocks.findAll(fixture, 'button')).toHaveLength(0);
  });

  it('heads the button with the label a picker gives it, and with nothing otherwise', () => {
    const bare = MockRender(SpreadsheetImportButtonComponent);
    expect(ngMocks.findAll(bare, '.import-label')).toHaveLength(0);

    const labelled = MockRender(SpreadsheetImportButtonComponent, {
      label: 'Add a projection from a file',
    });
    expect(ngMocks.find(labelled, '.import-label').nativeElement.textContent).toBe(
      'Add a projection from a file',
    );
  });

  it('keeps the label back too while the import is switched off', () => {
    environment.spreadsheetImportEnabled = false;
    const fixture = MockRender(SpreadsheetImportButtonComponent, { label: 'Add a projection' });
    expect(ngMocks.findAll(fixture, '.import-label')).toHaveLength(0);
  });

  it('loads the player pool once, then opens the dialog', () => {
    const component = MockRender(SpreadsheetImportButtonComponent).point.componentInstance;

    component.open();
    expect(component.dialogOpen()).toBe(true);
    component.close();
    component.open();

    expect(getPlayers).toHaveBeenCalledTimes(1);
    expect(component.players()).toBe(POOL);
  });

  it('says so and stays closed when the pool will not load', () => {
    getPlayers.mockReturnValue(throwError(() => new Error('down')));
    const component = MockRender(SpreadsheetImportButtonComponent).point.componentInstance;

    component.open();

    expect(component.dialogOpen()).toBe(false);
    expect(notifyError).toHaveBeenCalled();
  });

  it('saves the sheet as an imported board holding the whole pool, and hands it back', () => {
    const fixture = MockRender(SpreadsheetImportButtonComponent);
    const component = fixture.point.componentInstance;
    const imported = vi.fn();
    component.imported.subscribe(imported);
    component.open();

    component.save({ plan: plan(new Map([[1, { goals: 44 }]])), name: 'My sheet' });

    const request = createProjection.mock.calls[0][0];
    expect(request.name).toBe('My sheet');
    expect(request.kind).toBe('imported');
    expect(request.source).toBeUndefined();
    expect(request.data.settings.playerBasis).toBe('blank');
    expect(request.data.players).toHaveLength(POOL.length);
    const named = request.data.players.find((line: SkaterProjection) => line.playerId === 1);
    expect(named.stats.scoring.goals).toBe(44);
    expect(named.stats.scoring.points).toBe(44);
    const unnamed = request.data.players.find((line: SkaterProjection) => line.playerId === 2);
    expect(unnamed.stats.scoring.goals).toBe(0);

    expect(imported).toHaveBeenCalledWith({ id: 'new-board' });
    expect(component.dialogOpen()).toBe(false);
    expect(capture).toHaveBeenCalledWith('projection_spreadsheet_imported', {
      players: 1,
      not_found: 1,
    });
  });

  it('keeps the dialog open and asks for another name when the name is taken', () => {
    createProjection.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const component = MockRender(SpreadsheetImportButtonComponent).point.componentInstance;
    component.open();

    component.save({ plan: plan(new Map([[1, { goals: 44 }]])), name: 'Taken' });

    expect(component.dialogOpen()).toBe(true);
    expect(component.saving()).toBe(false);
    expect(component.saveError()).toContain('name');
  });

  it('reports any other failure in the dialog without closing it', () => {
    createProjection.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const component = MockRender(SpreadsheetImportButtonComponent).point.componentInstance;
    component.open();

    component.save({ plan: plan(new Map([[1, { goals: 44 }]])), name: 'Mine' });

    expect(component.dialogOpen()).toBe(true);
    expect(component.saveError()).toContain("Couldn't import");
  });
});
