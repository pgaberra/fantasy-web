import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  templateUrl: './site-footer.html',
  styleUrl: './site-footer.css',
})
export class SiteFooterComponent {
  readonly authService = inject(AuthService);
  // The price has to be reachable from the navigation, signed in or out, wherever there is one
  // to pay: it is a condition of Paddle's review, and before this the only way to the pricing
  // page for a signed-out visitor was to type the URL.
  readonly paymentsEnabled = environment.paymentsEnabled;
}
