import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LandingDemoComponent } from '../landing-demo/landing-demo';
import { FeatureService } from '../../services/feature.service';
import { IconComponent, IconName } from '../../shared/icon/icon';
import { environment } from '../../../environments/environment';

/** One tool on the landing page: what it is called, what it does, and the icon it wears. */
interface Feature {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
}

@Component({
  selector: 'app-in-season-landing',
  imports: [RouterLink, LandingDemoComponent, IconComponent],
  templateUrl: './in-season-landing.html',
  styleUrl: './in-season-landing.css',
})
export class InSeasonLandingComponent {
  private readonly features = inject(FeatureService);

  /**
   * The hero reads the calendar the same way the off-season notice does: while the build says it
   * is the off-season the page talks about the next season, otherwise about the one under way.
   * The page once said "Prepare for the upcoming season" in October with the season two weeks
   * old; a headline about a point in time needs the same switch the rest of the app keeps.
   */
  protected readonly offseason = environment.offseasonEnabled;

  /**
   * The AI projection is sold only where the BFF serves it, as the home page and the Premium
   * page already do: a feature nobody can reach is a refund request.
   */
  protected readonly aiProjectionServed = this.features.aiProjection;

  /** The tools for the season under way, in the order a manager reaches for them in a week. */
  protected readonly inSeason: readonly Feature[] = [
    {
      icon: 'calendar-days',
      title: 'Streamer Planner',
      description:
        "See which free agents play the most games in the week ahead, ranked to your league's categories, and weigh a pickup against the player you would drop.",
    },
    // Who's Hot is a build switch, so its card follows it rather than advertise a missing page.
    ...(environment.whosHotEnabled
      ? [
          {
            icon: 'flame' as const,
            title: "Who's Hot",
            description:
              'Who has produced the most over the last five, ten or twenty games, in your scoring. Catch a hot streak before the rest of your league does.',
          },
        ]
      : []),
    {
      icon: 'trophy',
      title: 'Team Power Rankings',
      description:
        'Every team in your league ranked on projected performance for the rest of the season, so you know where you really stand.',
    },
  ];

  /** The tools for the draft and the projection behind it. */
  protected readonly draftDay: readonly Feature[] = [
    {
      icon: 'import',
      title: environment.espnLeaguesEnabled
        ? 'Import your Yahoo or ESPN league'
        : 'Import your Yahoo league',
      description:
        'Pull in your scoring settings, roster slots and league size in one step, or set them by hand. Points and category leagues alike.',
    },
    {
      icon: 'clipboard-list',
      title: 'Draft Mode',
      description:
        'Take your projection to the draft as a live board. Follow a Yahoo draft pick by pick, or log the picks yourself, and see how the teams stack up as it unfolds.',
    },
    {
      icon: 'share',
      title: 'Share with your league',
      description:
        'Send a projection to a friend with one link. They can follow your updates or take a copy and make it their own.',
    },
  ];
}
