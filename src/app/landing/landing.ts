import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LandingDemoComponent } from './landing-demo/landing-demo';
import { LandingLineupComponent } from './landing-lineup/landing-lineup';
import { FeatureService } from '../services/feature.service';
import { IconComponent, IconName } from '../shared/icon/icon';
import { TeamLogoComponent } from '../shared/team-logo/team-logo';
import { environment } from '../../environments/environment';

/** A tool named in the jump strip under the hero, each with a working panel further down. */
interface ToolLink {
  readonly id: string;
  readonly icon: IconName;
  readonly name: string;
}

/** One night of the planner's example week. */
interface ExampleNight {
  readonly day: string;
  readonly games: number;
  readonly offNight: boolean;
  /** The positions the example lineup still has a spot for, or none for a full night. */
  readonly room: readonly string[];
}

/** A row of an example leaderboard: a player, his club and the figure he is ranked by. */
interface ExamplePlayer {
  readonly name: string;
  readonly positions: string;
  readonly club: string;
  readonly games: number;
  readonly score: string;
}

/** A row of the example power rankings. */
interface ExampleTeam {
  readonly name: string;
  readonly score: string;
  readonly you?: boolean;
}

/** A draft-day tool, listed rather than carded. */
interface DraftTool {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
}

/**
 * The signed-out landing page: the lineup card and the live editor as proof, the tools as working
 * panels, and a free account as the one action.
 *
 * Nothing on it names a season or a point in the calendar. The page once said "Prepare for the
 * upcoming 2026-27 season" two weeks into that season, and the fix that followed only moved the
 * date into a switch; a landing page that has to be edited every summer and every October is the
 * wrong page. Every line here describes what a tool does, which is true in June and in January.
 */
@Component({
  selector: 'app-landing',
  imports: [
    RouterLink,
    LandingDemoComponent,
    LandingLineupComponent,
    IconComponent,
    TeamLogoComponent,
  ],
  templateUrl: './landing.html',
  styleUrls: ['./landing.css', './landing-panels.css'],
})
export class LandingComponent {
  private readonly features = inject(FeatureService);

  /** Who's Hot is a build switch, so its panel and link follow it rather than sell a missing page. */
  protected readonly whosHotEnabled = environment.whosHotEnabled;

  /** The league platforms the build imports from, as the page may name them. */
  protected readonly platforms = environment.espnLeaguesEnabled ? 'Yahoo or ESPN' : 'Yahoo';

  /**
   * The AI projection is sold only where the BFF serves it, as the home page and the Premium page
   * already do: a feature nobody can reach is a refund request.
   */
  protected readonly aiProjectionServed = this.features.aiProjection;

  protected readonly tools: readonly ToolLink[] = [
    { id: 'streamer-planner', icon: 'calendar-days', name: 'Streamer Planner' },
    ...(this.whosHotEnabled ? [{ id: 'whos-hot', icon: 'flame' as const, name: "Who's Hot" }] : []),
    { id: 'team-power-rankings', icon: 'trophy', name: 'Team Power Rankings' },
  ];

  /*
   * The three panels below are examples, labelled as such on the page: the planner, Who's Hot and
   * the power rankings all read a signed-in manager's own league, so there is nothing real to show
   * a visitor. The shapes are the pages' own (the night strip, the leaderboard, the ranked table);
   * the figures are made up and stay round.
   */
  protected readonly exampleWeek: readonly ExampleNight[] = [
    { day: 'Mon', games: 8, offNight: false, room: ['D'] },
    { day: 'Tue', games: 12, offNight: false, room: ['C', 'LW', 'D'] },
    { day: 'Wed', games: 3, offNight: true, room: [] },
    { day: 'Thu', games: 10, offNight: false, room: ['C', 'D'] },
    { day: 'Fri', games: 4, offNight: true, room: ['G'] },
    { day: 'Sat', games: 13, offNight: false, room: ['LW', 'RW'] },
    { day: 'Sun', games: 6, offNight: true, room: [] },
  ];

  protected readonly examplePickups: readonly ExamplePlayer[] = [
    { name: 'Tyler Toffoli', positions: 'RW', club: 'SJS', games: 4, score: '12.4' },
    { name: 'Shea Theodore', positions: 'D', club: 'VGK', games: 4, score: '11.1' },
    { name: 'Jake Oettinger', positions: 'G', club: 'DAL', games: 3, score: '10.6' },
  ];

  protected readonly exampleHot: readonly ExamplePlayer[] = [
    { name: 'Jason Robertson', positions: 'LW', club: 'DAL', games: 10, score: '58.5' },
    { name: 'Tage Thompson', positions: 'C', club: 'BUF', games: 10, score: '55.0' },
    { name: 'Adrian Kempe', positions: 'LW, RW', club: 'LAK', games: 9, score: '51.0' },
    { name: 'Zach Werenski', positions: 'D', club: 'CBJ', games: 10, score: '49.5' },
    { name: 'Jesper Bratt', positions: 'RW', club: 'NJD', games: 10, score: '47.0' },
  ];

  protected readonly exampleTeams: readonly ExampleTeam[] = [
    { name: 'Top Shelf Snipers', score: '12.23' },
    { name: 'Five-Hole Heroes', score: '8.24', you: true },
    { name: 'Bardown Bandits', score: '7.21' },
    { name: 'Glove Side Gang', score: '3.37' },
    { name: 'Biscuit Basket', score: '-0.35' },
    { name: 'Zamboni Drivers', score: '-3.78' },
  ];

  protected readonly draftTools: readonly DraftTool[] = [
    {
      icon: 'import',
      title: `Import your ${this.platforms} league`,
      description:
        'Pull in scoring settings, roster spots and league size in one step, or set them by hand.',
    },
    {
      icon: 'clipboard-list',
      title: 'Draft Mode',
      description:
        'Your projection as a live draft board. Follow a Yahoo draft pick by pick, or log the picks yourself.',
    },
    {
      icon: 'share',
      title: 'Share with your league',
      description:
        'Send a projection to a friend with one link. They can follow your updates or take a copy and make it their own.',
    },
  ];
}
