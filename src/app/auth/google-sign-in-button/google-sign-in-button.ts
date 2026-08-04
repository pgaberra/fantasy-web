import { Component, output } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * "Continue with Google" button. We render our own button (rather than Google's embedded GSI
 * button) and emit `login` on click; the parent starts a top-level OAuth redirect. This works
 * on browsers that block the embedded GSI script/iframe — notably iOS Safari under Intelligent
 * Tracking Prevention, where the embedded button silently fails to render. Hidden when no
 * client id is configured.
 */
@Component({
  selector: 'app-google-sign-in-button',
  imports: [],
  templateUrl: './google-sign-in-button.html',
  styleUrl: './google-sign-in-button.css',
})
export class GoogleSignInButtonComponent {
  readonly login = output<void>();
  readonly clientId = environment.googleClientId;
}
