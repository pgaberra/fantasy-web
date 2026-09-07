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
      title: 'Your league, not a generic ranking',
      description:
        "Points or categories, every player is ranked by your league's own scoring settings. No spreadsheet formulas to keep alive.",
    },
    {
      title: 'Category leagues get one number',
      description:
        'Z-scores fold every category you play into a single ranking, so a faceoff specialist and a sniper are finally comparable.',
    },
    {
      title: 'Draft day',
      description:
        'Track every pick as it happens, and see how the rosters stack up the moment the draft ends.',
    },
  ];
}
