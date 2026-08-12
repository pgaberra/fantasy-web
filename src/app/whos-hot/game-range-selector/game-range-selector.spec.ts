import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { GameRangeSelectorComponent } from './game-range-selector';

describe('GameRangeSelectorComponent', () => {
  beforeEach(() => MockBuilder(GameRangeSelectorComponent));

  const render = (fromGame = 63, toGame = 82) =>
    MockRender(GameRangeSelectorComponent, {
      seasonLabel: '2025-26',
      scheduleLength: 82,
      fromGame,
      toGame,
      perGame: false,
      minGames: 1,
    }).point.componentInstance;

  const preset = (component: GameRangeSelectorComponent, label: string) =>
    component.presets.find((candidate) => candidate.label === label)!;

  const inputEvent = (value: number): Event =>
    ({ target: { value: String(value) } }) as unknown as Event;

  it('counts the span inclusively', () => {
    const component = render(50, 82);

    expect(component.spanLength()).toEqual(33);
    expect(component.summary()).toEqual('33 games · #50–82');
  });

  it('describes a one-game span in the singular', () => {
    expect(render(41, 41).summary()).toEqual('1 game · #41–41');
  });

  it('resolves the last-N presets against the season length', () => {
    const component = render(1, 82);

    component.applyPreset(preset(component, 'Last 20'));

    expect(component.fromGame()).toEqual(63);
    expect(component.toGame()).toEqual(82);
  });

  it('splits the season into halves that meet without overlapping', () => {
    const component = render();

    component.applyPreset(preset(component, 'First half'));
    const firstHalfEnd = component.toGame();
    component.applyPreset(preset(component, 'Second half'));

    expect(component.fromGame()).toEqual(firstHalfEnd + 1);
    expect(component.toGame()).toEqual(82);
  });

  it('marks the preset that matches the current range', () => {
    const component = render(1, 82);

    expect(component.isPresetActive()(preset(component, 'Full season'))).toEqual(true);
    expect(component.isPresetActive()(preset(component, 'Last 10'))).toEqual(false);
  });

  it('pushes the upper bound along when the lower one passes it', () => {
    const component = render(10, 20);

    component.onFromInput(inputEvent(60));

    expect(component.fromGame()).toEqual(60);
    expect(component.toGame()).toEqual(60);
  });

  it('pulls the lower bound back when the upper one drops below it', () => {
    const component = render(50, 82);

    component.onToInput(inputEvent(20));

    expect(component.toGame()).toEqual(20);
    expect(component.fromGame()).toEqual(20);
  });

  it('clamps a bound to the schedule', () => {
    const component = render();

    component.onToInput(inputEvent(500));
    expect(component.toGame()).toEqual(82);

    component.onFromInput(inputEvent(-5));
    expect(component.fromGame()).toEqual(1);
  });

  it('never lets the minimum-games filter exceed the span itself', () => {
    const component = render(70, 82);

    component.onMinGamesInput(inputEvent(40));

    expect(component.minGames()).toEqual(13);
  });

  it('toggles the per-game view', () => {
    const component = render();

    component.togglePerGame();

    expect(component.perGame()).toEqual(true);
  });
});
