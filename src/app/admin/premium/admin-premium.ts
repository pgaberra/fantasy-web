import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AdminService } from '../../services/admin.service';
import { AdminPremiumCustomerResponse } from '../../api/models';

/** How long a grant can run, in the lengths worth offering. */
const MONTH_OPTIONS = [1, 2, 3, 6, 12] as const;

/**
 * Premium seen from the admin side: who has it, and giving it to someone without a payment.
 *
 * A given membership is stored apart from any subscription, so ending one here never touches
 * what a paying member is billed.
 */
@Component({
  selector: 'app-admin-premium',
  imports: [DatePipe],
  templateUrl: './admin-premium.html',
  styleUrl: './admin-premium.css',
})
export class AdminPremiumComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly monthOptions = MONTH_OPTIONS;

  readonly customers = signal<AdminPremiumCustomerResponse[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly email = signal('');
  readonly months = signal<number>(2);
  readonly reason = signal('');
  readonly granting = signal(false);
  readonly grantError = signal<string | null>(null);
  readonly grantMessage = signal<string | null>(null);

  readonly revokingUserId = signal<string | null>(null);
  readonly revokeError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadCustomers();
  }

  loadCustomers(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.adminService.premiumCustomers().subscribe({
      next: (customers) => {
        this.customers.set(customers);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set("Couldn't load Premium members.");
      },
    });
  }

  onEmailInput(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  onMonthsChange(event: Event): void {
    this.months.set(Number((event.target as HTMLSelectElement).value));
  }

  onReasonInput(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  givesPremium(customer: AdminPremiumCustomerResponse): boolean {
    return customer.source === 'grant' || customer.source === 'both';
  }

  sourceLabel(customer: AdminPremiumCustomerResponse): string {
    switch (customer.source) {
      case 'grant':
        return 'Given';
      case 'both':
        return 'Paid and given';
      default:
        return 'Paid';
    }
  }

  grant(): void {
    const email = this.email().trim();
    if (!email) {
      return;
    }
    const reason = this.reason().trim();
    this.granting.set(true);
    this.grantError.set(null);
    this.grantMessage.set(null);
    this.adminService
      .grantPremium({ email, months: this.months(), reason: reason || undefined })
      .subscribe({
        next: (grant) => {
          this.granting.set(false);
          this.email.set('');
          this.reason.set('');
          this.grantMessage.set(`${grant.email} has Premium until ${formatDate(grant.expiresAt)}.`);
          this.loadCustomers();
        },
        error: (response: { status?: number }) => {
          this.granting.set(false);
          this.grantError.set(
            response.status === 404
              ? 'No account with that email.'
              : "Couldn't give Premium. Nothing was changed.",
          );
        },
      });
  }

  revoke(customer: AdminPremiumCustomerResponse): void {
    this.revokingUserId.set(customer.userId);
    this.revokeError.set(null);
    this.grantMessage.set(null);
    this.adminService.revokePremiumGrants(customer.userId).subscribe({
      next: () => {
        this.revokingUserId.set(null);
        this.loadCustomers();
      },
      error: () => {
        this.revokingUserId.set(null);
        this.revokeError.set(`Couldn't end the Premium given to ${customer.email}.`);
      },
    });
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(value));
}
