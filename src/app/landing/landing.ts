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
  // A visitor weighing up the app should find the price from the front page, and the pricing
  // page is only there to find where a build sells something.
  readonly paymentsEnabled = environment.paymentsEnabled;

  readonly features: Feature[] = [
    {
      title: 'Your scoring, not a generic top 200',
      description:
        'Points or categories, custom weights included. The rankings reorder around what your league actually does.',
    },
    {
      title: 'Category leagues in one ranking',
      description:
        'Z-Scores put hits, saves and plus-minus on the same scale, so a defenseman and a goalie become comparable numbers.',
    },
    {
      title: 'Built for draft day',
      description:
        'Draft mode updates as picks come off the board, and ends with power rankings for every team.',
    },
  ];
}
