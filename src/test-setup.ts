import { AriaDescriber, FocusMonitor, InputModalityDetector } from '@angular/cdk/a11y';
import { Overlay, OverlayPositionBuilder } from '@angular/cdk/overlay';
import { ngMocks } from 'ng-mocks';
import { DraftRosterService } from './app/draft-mode/draft-roster.service';
import { DraftSnakeService } from './app/draft-mode/draft-snake.service';
import { ActiveColumnsService } from './app/services/active-columns.service';
import { LeagueChoiceService } from './app/services/league-choice.service';
import { PositionFilterService } from './app/services/position-filter.service';
import { ProjectionCalculationService } from './app/services/projection-calculation.service';
import { ProjectionRankingService } from './app/services/projection-ranking.service';
import { ProjectionSerializerService } from './app/services/projection-serializer.service';
import { ProjectionUpdateService } from './app/services/projection-update.service';
import { StatInfoService } from './app/services/stat-info.service';
import { StatWarningService } from './app/services/stat-warning.service';
import { TierService } from './app/services/tier.service';
import { YahooConnectReturnService } from './app/services/yahoo-connect-return.service';
import { ToiService } from './app/services/toi.service';
import { OpenPopovers } from './app/shared/popover/open-popovers';
import { AiProjectionAccess } from './app/shared/premium/ai-projection-access';

/**
 * jsdom lays nothing out, so it ships no ResizeObserver. A component that observes its own box
 * would otherwise throw on construction in every test that renders it. The stub never reports a
 * resize, which is the truth in a document that never reflows — a test that cares about the
 * callback supplies its own geometry and triggers it directly.
 */
class InertResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= InertResizeObserver;

/**
 * jsdom has no media queries either, and a component that asks what kind of pointer is on the
 * other end would throw before it could render. The stub answers no to everything, which is the
 * truth in a document with no window to measure and nobody pointing at it; a test that wants a
 * capability turned on says so itself.
 */
globalThis.matchMedia ??= (media: string) =>
  ({
    media,
    matches: false,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

/**
 * Since 14.18, ng-mocks replaces every root service a kept declaration asks for with `inject()` by
 * an empty mock, unless the spec keeps it. Before, it did that only with auto-spy switched on,
 * which this suite never does, so all of them were quietly real and the specs came to rely on it.
 *
 * These are the services that are part of the unit rather than its edge: they compute, or hold a
 * choice in the browser's own storage, and never reach the BFF or anyone else. An empty mock of
 * one is never what a spec means, so they stay real everywhere. A spec that does want one stubbed
 * still says `.mock()`, which wins; anything that makes a request is mocked unless a spec says so.
 */
[
  ActiveColumnsService,
  AiProjectionAccess,
  DraftRosterService,
  DraftSnakeService,
  LeagueChoiceService,
  OpenPopovers,
  PositionFilterService,
  ProjectionCalculationService,
  ProjectionRankingService,
  ProjectionSerializerService,
  ProjectionUpdateService,
  StatInfoService,
  StatWarningService,
  TierService,
  ToiService,
  YahooConnectReturnService,
  // The CDK's own plumbing, which a kept popover or menu would otherwise drive as an empty mock.
  AriaDescriber,
  FocusMonitor,
  InputModalityDetector,
  Overlay,
  OverlayPositionBuilder,
].forEach((service) => ngMocks.globalKeep(service));
