import { Component, output } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ProjectionResponse } from '../../api/models/projection-response';
import { ShareImportComponent } from '../share-import/share-import';
import { SpreadsheetImportButtonComponent } from '../spreadsheet-import/spreadsheet-import-button';

/**
 * The two ways a projection the user did not build here gets in: following somebody's share link,
 * or uploading a spreadsheet. They land in different places now, and the pickers place each door
 * in the group its result appears in, so this pair is the home page's shape alone: one panel with
 * no groups to split them between, where the "or" is what says they are alternatives.
 */
@Component({
  selector: 'app-projection-import',
  imports: [ShareImportComponent, SpreadsheetImportButtonComponent],
  templateUrl: './projection-import.html',
  styleUrl: './projection-import.css',
})
export class ProjectionImportComponent {
  readonly imported = output<ProjectionResponse>();

  /**
   * Read here as well as in the button itself: with the spreadsheet import off in the build, the
   * button draws nothing, and an "or" with nothing after it is worse than no "or" at all.
   */
  protected readonly spreadsheetEnabled = environment.spreadsheetImportEnabled;
}
