import { Component, input, output } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ProjectionResponse } from '../../api/models/projection-response';
import { ShareImportComponent } from '../share-import/share-import';
import { SpreadsheetImportButtonComponent } from '../spreadsheet-import/spreadsheet-import-button';

/**
 * The two ways a board somebody else made gets in: a share link, or a spreadsheet. Three pages
 * offer both (the home page, the new-projection page, the draft picker), and each wrote the pair
 * out itself, which left nothing saying they are alternatives rather than a field and then a
 * button. The "or" between them belongs with the pair, so the pair lives here.
 */
@Component({
  selector: 'app-projection-import',
  imports: [ShareImportComponent, SpreadsheetImportButtonComponent],
  templateUrl: './projection-import.html',
  styleUrl: './projection-import.css',
})
export class ProjectionImportComponent {
  /** Names what the copy is for, which differs between the pages that take one. */
  readonly label = input.required<string>();

  readonly imported = output<ProjectionResponse>();

  /**
   * Read here as well as in the button itself: with the spreadsheet import off in the build, the
   * button draws nothing, and an "or" with nothing after it is worse than no "or" at all.
   */
  protected readonly spreadsheetEnabled = environment.spreadsheetImportEnabled;
}
