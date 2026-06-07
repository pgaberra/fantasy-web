import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

interface MockPlayer {
  name: string;
  team: string;
  g: number;
  a: number;
  pts: number;
}

interface Feature {
  title: string;
  desc: string;
  icon: string;
}

@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class LandingComponent {
  readonly authService = inject(AuthService);

  readonly mockPlayers: MockPlayer[] = [
    { name: 'N. MacKinnon', team: 'COL', g: 52, a: 87, pts: 139 },
    { name: 'D. Pastrnak', team: 'BOS', g: 54, a: 72, pts: 126 },
    { name: 'C. McDavid', team: 'EDM', g: 45, a: 79, pts: 124 },
    { name: 'M. Tkachuk', team: 'FLA', g: 41, a: 68, pts: 109 },
  ];

  readonly features: Feature[] = [
    {
      title: 'Custom Scoring',
      desc: 'Mirror your league exactly — points, categories, head-to-head. Tweak any weight and see rankings update instantly.',
      icon: 'scoring',
    },
    {
      title: 'Player Projections',
      desc: 'Stat-based projections for every skater and goalie, adjusted to your scoring system so you know true draft value.',
      icon: 'projections',
    },
    {
      title: 'Draft Intelligence',
      desc: 'Compare players side-by-side, identify sleepers, and build the best roster before your draft even starts.',
      icon: 'draft',
    },
  ];

  readonly steps = [
    {
      number: '01',
      title: 'Configure your league',
      desc: 'Enter your scoring settings once. Points leagues, category leagues — any format is supported.',
    },
    {
      number: '02',
      title: 'Review projections',
      desc: 'Browse player projections re-ranked for your specific scoring. The value order changes — find who your opponents will overlook.',
    },
    {
      number: '03',
      title: 'Draft with confidence',
      desc: 'Walk into draft day with a clear tier list and targets. Make data-backed picks every round.',
    },
  ];
}
