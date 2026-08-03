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
        "Start from last season's stats and set any weights — points or categories. Every skater and goalie is ranked to your exact league rules.",
    },
    {
      title: 'Model the season you expect',
      description:
        "Think a player's due for more games or ice time? Adjust it and every projected stat — and their ranking — moves to match.",
    },
    {
      title: 'Real category Z-Score',
      description:
        'Category leagues are ranked by per-category Z-Score across a league-sized pool — not a generic points list.',
    },
  ];
}
