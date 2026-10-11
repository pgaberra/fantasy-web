import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LandingDemoComponent } from '../landing-demo/landing-demo';

interface Feature {
  title: string;
  description: string;
}

/**
 * The landing page as it shipped before the rewrite (web#1153), kept as the default while the new
 * page sits behind `NEW_LANDING_ENABLED` (Alexander, 2026-10-11: staging should be able to switch
 * the new page off). Its headline names a season, which is why it was rewritten; it goes when the
 * flag does.
 */
@Component({
  selector: 'app-classic-landing',
  imports: [RouterLink, LandingDemoComponent],
  templateUrl: './classic-landing.html',
  styleUrl: './classic-landing.css',
})
export class ClassicLandingComponent {
  readonly features: Feature[] = [
    {
      title: 'Ditch the Excel Sheets',
      description:
        "Set your league's scoring and adjust your projections without wrestling with formulas or spreadsheets.",
    },
    {
      title: 'Category Scoring, Solved',
      description:
        'Playing in a Category League? No problem. Compare every player in a single ranking using our Z-Score algorithm.',
    },
    {
      title: 'Built for Draft Day',
      description:
        'Use your projection as a live draft board, track every pick, and see how the teams stack up as the draft unfolds.',
    },
  ];
}
