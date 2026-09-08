import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LandingDemoComponent } from './landing-demo/landing-demo';
import { environment } from '../../environments/environment';

interface Feature {
  title: string;
  description: string;
}

@Component({
  selector: 'app-landing',
  imports: [RouterLink, LandingDemoComponent],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class LandingComponent {
  // A visitor weighing up the app should find the price from the front page, and the Premium
  // page is only there to find where a build sells something.
  readonly paymentsEnabled = environment.paymentsEnabled;

  readonly features: Feature[] = [
    {
      title: 'Build rankings without the spreadsheet',
      description:
        "Set your league's scoring and adjust your projections without wrestling with formulas or spreadsheets.",
    },
    {
      title: 'Built for points and categories',
      description:
        'Compare players using the scoring system your league actually uses. Z-Scores make category values easy to compare in one ranking.',
    },
    {
      title: 'Draft with your rankings',
      description:
        'Use your projection as a live draft board, track every pick, and see how the teams stack up as the draft unfolds.',
    },
  ];
}
