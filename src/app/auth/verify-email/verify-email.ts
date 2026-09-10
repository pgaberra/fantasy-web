import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';

type VerifyStatus = 'verifying' | 'succeeded' | 'failed' | 'no-token';

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink, LoadingIndicatorComponent],
  templateUrl: './verify-email.html',
  styleUrl: '../auth-page.css',
})
export class VerifyEmailComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  readonly status = signal<VerifyStatus>(this.token.length > 0 ? 'verifying' : 'no-token');

  ngOnInit() {
    if (this.token.length > 0) {
      void this.verify();
    }
  }

  private async verify() {
    try {
      await firstValueFrom(this.authService.verifyEmail(this.token));
      this.status.set('succeeded');
    } catch {
      this.status.set('failed');
    }
  }
}
