import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Feature {
  title: string;
  description: string;
}

interface Step {
  number: string;
  title: string;
  description: string;
}

interface MockRow {
  rank: number;
  name: string;
  team: string;
  headshot: string;
  goals: number;
  assists: number;
  ppp: number;
  hits: number;
  blocks: number;
  value: string;
  highlight?: boolean;
}

const HEADSHOT = 'https://assets.nhle.com/mugs/nhl/20242025';

@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class LandingComponent {
  readonly features: Feature[] = [
    {
      title: 'Projections tuned to your scoring',
      description:
        'Set your league up once — points or categories, any weights — and every skater and goalie is projected against your exact rules.',
    },
    {
      title: 'Real category Z-Score ranking',
      description:
        'For category leagues, players are ranked by per-category Z-Score across a league-sized pool — not a generic points list that lies to you.',
    },
    {
      title: 'Built for draft day',
      description:
        'Edit any projection and watch the board re-rank live. Filter by position or team, spot value, and walk in with a plan.',
    },
    {
      title: 'Hockey, and only hockey',
      description:
        'No bolted-on multi-sport compromises. SlapStat does one thing — fantasy hockey draft prep — and does it properly.',
    },
  ];

  readonly steps: Step[] = [
    {
      number: '1',
      title: 'Configure your league',
      description: 'Enter your scoring settings — points or categories, roster slots, league size.',
    },
    {
      number: '2',
      title: 'Tune the projections',
      description:
        'Adjust any player and the rankings recompute instantly against your scoring system.',
    },
    {
      number: '3',
      title: 'Draft with an edge',
      description:
        'Use your custom board to find the value your league-mates will miss on draft day.',
    },
  ];

  readonly mockRows: MockRow[] = [
    {
      rank: 1,
      name: 'Nathan MacKinnon',
      team: 'COL',
      headshot: `${HEADSHOT}/COL/8477492.png`,
      goals: 53,
      assists: 74,
      ppp: 51,
      hits: 42,
      blocks: 33,
      value: '674',
    },
    {
      rank: 2,
      name: 'Connor McDavid',
      team: 'EDM',
      headshot: `${HEADSHOT}/EDM/8478402.png`,
      goals: 48,
      assists: 90,
      ppp: 56,
      hits: 28,
      blocks: 22,
      value: '667',
    },
    {
      rank: 3,
      name: 'Macklin Celebrini',
      team: 'SJS',
      headshot: `${HEADSHOT}/SJS/8484801.png`,
      goals: 45,
      assists: 70,
      ppp: 41,
      hits: 53,
      blocks: 29,
      value: '600',
      highlight: true,
    },
    {
      rank: 4,
      name: 'Nikita Kucherov',
      team: 'TBL',
      headshot: `${HEADSHOT}/TBL/8476453.png`,
      goals: 44,
      assists: 86,
      ppp: 60,
      hits: 26,
      blocks: 31,
      value: '598',
    },
    {
      rank: 5,
      name: 'Jason Robertson',
      team: 'DAL',
      headshot: `${HEADSHOT}/DAL/8480027.png`,
      goals: 45,
      assists: 51,
      ppp: 37,
      hits: 48,
      blocks: 22,
      value: '535',
    },
  ];
}
