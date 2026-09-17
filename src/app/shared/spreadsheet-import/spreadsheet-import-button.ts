import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../environments/environment';
import { ProjectionResponse } from '../../api/models/projection-response';
import { Player } from '../../models/player.model';
import { AnalyticsService } from '../../services/analytics.service';
import { NotificationService } from '../../services/notification.service';
import { PlayerService } from '../../services/player.service';
import { ProjectionSerializerService } from '../../services/projection-serializer.service';
import { ProjectionStorageService } from '../../services/projection-storage.service';
import { StatInfoService } from '../../services/stat-info.service';
import { createDefaultProjectionState } from '../../draft-projection/projection-defaults';
import { IconComponent } from '../icon/icon';
import { LoadingIndicatorComponent } from '../loading-indicator/loading-indicator';
import { linesFromSheet } from './spreadsheet-import';
import { SpreadsheetImport, SpreadsheetImportDialogComponent } from './spreadsheet-import-dialog';

/**
 * Imports a projection kept in a spreadsheet as an imported board, the same kind of thing a share
 * link gives: it sits with the share-link field wherever one is (the home page, the new-projection
 * page, the draft picker), lands in the Imports list, and is picked from there as a starting point
 * or something to draft against.
 *
 * <p>It draws nothing unless the build turns the import on (`SPREADSHEET_IMPORT_ENABLED`), so each
 * page can place it without asking.
 */
@Component({
  selector: 'app-spreadsheet-import-button',
  imports: [IconComponent, LoadingIndicatorComponent, SpreadsheetImportDialogComponent],
  templateUrl: './spreadsheet-import-button.html',
  styleUrl: './spreadsheet-import-button.css',
})
export class SpreadsheetImportButtonComponent {
  private readonly playerService = inject(PlayerService);
  private readonly storage = inject(ProjectionStorageService);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly statInfo = inject(StatInfoService);
  private readonly notification = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly enabled = environment.spreadsheetImportEnabled;

  readonly imported = output<ProjectionResponse>();

  readonly loadingPlayers = signal(false);
  /** The pool the sheet is matched against, loaded the first time the dialog is asked for. */
  readonly players = signal<readonly Player[] | null>(null);
  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  open(): void {
    this.saveError.set(null);
    if (this.players()) {
      this.dialogOpen.set(true);
      return;
    }
    this.loadingPlayers.set(true);
    this.playerService
      .getPlayers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (players) => {
          this.loadingPlayers.set(false);
          // An empty pool cannot match a single name, and a board built from it would hold nothing.
          if (!players.length) {
            this.notification.error("Couldn't load player data. Please try again.");
            return;
          }
          this.players.set(players);
          this.dialogOpen.set(true);
        },
        error: () => {
          this.loadingPlayers.set(false);
          this.notification.error("Couldn't load player data. Please try again.");
        },
      });
  }

  /** Closing mid-save is ignored: the board may already exist, and the result is still to come. */
  close(): void {
    if (!this.saving()) {
      this.dialogOpen.set(false);
    }
  }

  save({ plan, name }: SpreadsheetImport): void {
    const players = this.players();
    if (!players || this.saving()) {
      return;
    }
    const data = this.serializer.toProjectionData({
      ...createDefaultProjectionState((key) => this.statInfo.isRateStat(key)),
      // Every player the sheet does not name starts empty, and so does one who joins the pool later.
      playerBasis: 'blank',
      playerProjections: linesFromSheet(players, plan.stats),
    });
    this.saving.set(true);
    this.saveError.set(null);
    this.storage
      .createProjection({ name, kind: 'imported', data })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => {
          this.saving.set(false);
          this.dialogOpen.set(false);
          this.analytics.capture('projection_spreadsheet_imported', {
            players: plan.stats.size,
            not_found: plan.notFound.length + plan.ambiguous.length,
          });
          this.imported.emit(projection);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          // A name already taken is the importer's to settle, in the name field of the dialog.
          if (error instanceof HttpErrorResponse && error.status === 409) {
            this.saveError.set('You already have a projection with that name. Choose another.');
            return;
          }
          this.saveError.set("Couldn't import the spreadsheet. Please try again.");
        },
      });
  }
}
