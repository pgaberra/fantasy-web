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
      title: 'Tuned to your scoring',
      description:
        'Points or categories, any weights — every skater and goalie is projected against your exact league rules.',
    },
    {
      title: 'Real category Z-Score',
      description:
        'Category leagues are ranked by per-category Z-Score across a league-sized pool — not a generic points list.',
    },
    {
      title: 'Built for draft day',
      description:
        'Edit projections live, filter by position or team, and walk in with a board only you have.',
    },
  ];
}
