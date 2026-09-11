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
      title: 'Ditch the Excel Sheets',
      description:
        "Set your league's scoring and adjust your projections without wrestling with formulas or spreadsheets.",
    },
    {
      title: 'Category Scoring, Solved',
      description:
        "Compare every player in one ranking. Z-Scores put your league's categories on the same scale.",
    },
    {
      title: 'Built for Draft Day',
      description:
        'Use your projection as a live draft board, track every pick, and see how the teams stack up as the draft unfolds.',
    },
  ];
}
