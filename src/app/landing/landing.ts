import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LandingDemoComponent } from './landing-demo/landing-demo';

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
