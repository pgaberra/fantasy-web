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
        'Tailor projections directly to your league settings, whether you play points or categories. No more manual formulas or messy spreadsheets.',
    },
    {
      title: 'Category Scoring, Solved',
      description:
        "Comparing player value in category leagues used to be guesswork. Our Z-Score ranking combines all your league's categories into a single, easy-to-read board.",
    },
    {
      title: 'Built for Draft Day',
      description:
        'Run your draft in real-time with an interactive draft board, track picks seamlessly, and see instant post-draft power rankings to compare every team.',
    },
  ];
}
