import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BillingService } from '../services/billing.service';
import { EntitlementService } from '../services/entitlement.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-account',
  imports: [RouterLink, DatePipe],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class AccountComponent implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  protected readonly entitlement = inject(EntitlementService);
  protected readonly openingPortal = signal(false);
  protected readonly justSubscribed = signal(false);

  ngOnInit(): void {
    // Returning from checkout or the billing portal — re-read the possibly just-changed entitlement.
    if (this.route.snapshot.queryParamMap.get('checkout') === 'success') {
      this.justSubscribed.set(true);
    }
    this.entitlement.refresh();
  }

  reload(): void {
    this.entitlement.refresh();
  }

  manageBilling(): void {
    this.openingPortal.set(true);
    this.billing.openPortal().subscribe({
      next: (response) => {
        window.location.href = response.portalUrl;
      },
      error: () => {
        this.openingPortal.set(false);
        this.notifications.error('Could not open the billing portal. Please try again.');
      },
    });
  }
}
