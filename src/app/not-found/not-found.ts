import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The wildcard route. Until this existed the router had nothing to match an unknown path
 * against, so it threw NG04002, the ErrorHandler reported it to Sentry, and the visitor was
 * left looking at the header above an empty page.
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  styleUrl: './not-found.css',
})
export class NotFoundComponent {}
