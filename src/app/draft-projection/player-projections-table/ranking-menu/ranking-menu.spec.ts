import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { RankingMenuComponent } from './ranking-menu';
import { ManualRanking, PROJECTED_RANKING, withMode } from '../../../models/manual-ranking';
import { RankedPlayerType } from '../../../models/manual-ranking';

describe('RankingMenuComponent', () => {
  beforeEach(() => MockBuilder(RankingMenuComponent));

  const render = (
    ranking: ManualRanking = PROJECTED_RANKING,
    rankableType: RankedPlayerType | null = null,
  ) => MockRender(RankingMenuComponent, { ranking, rankableType });

  const buttonSaying = (text: string) =>
    ngMocks.findAll('button').find((button) => button.nativeElement.textContent.trim() === text)!;

  it('offers both player types their own choice', () => {
    render();

    expect(ngMocks.formatText(ngMocks.find('app-ranking-menu'))).toContain('Skaters');
    expect(ngMocks.formatText(ngMocks.find('app-ranking-menu'))).toContain('Goalies');
  });

  it('switches one type without touching the other', () => {
    const fixture = render();

    buttonSaying('My order').nativeElement.click();
    fixture.detectChanges();

    expect(fixture.point.componentInstance.ranking().skater.mode).toBe('manual');
    expect(fixture.point.componentInstance.ranking().goalie.mode).toBe('projected');
  });

  /** Choosing to order a type by hand is a statement that you mean to start ordering it. */
  it('asks for the view that type is ranked in when it is switched on', () => {
    const fixture = render();
    const asked: RankedPlayerType[] = [];
    fixture.point.componentInstance.rankRequested.subscribe((type) => asked.push(type));

    buttonSaying('My order').nativeElement.click();

    expect(asked).toEqual(['skater']);
  });

  it('says nothing about typing places while nothing is ranked by hand', () => {
    render();

    expect(ngMocks.formatText(ngMocks.find('app-ranking-menu'))).not.toContain('# column');
  });

  it('offers a way back to the view once the table has moved off it', () => {
    render(withMode(PROJECTED_RANKING, 'goalie', 'manual'), null);

    expect(buttonSaying('Show goalies to rank them')).toBeDefined();
  });

  it('does not offer it while the table is already showing that type', () => {
    render(withMode(PROJECTED_RANKING, 'goalie', 'manual'), 'goalie');

    expect(buttonSaying('Show goalies to rank them')).toBeUndefined();
  });
});
