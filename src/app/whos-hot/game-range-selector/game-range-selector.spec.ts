import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { GameRangeSelectorComponent } from './game-range-selector';

describe('GameRangeSelectorComponent', () => {
  beforeEach(() => MockBuilder(GameRangeSelectorComponent));

  const render = (fromGame = 63, toGame = 82) =>
    MockRender(GameRangeSelectorComponent, {
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

  const TRACK_WIDTH = 400;

  /** A hover a given fraction of the way along a track that starts at the viewport's left edge. */
  const hoverAt = (fraction: number): PointerEvent => {
    const track = {
      getBoundingClientRect: () => ({ left: 0, width: TRACK_WIDTH }) as DOMRect,
    } as HTMLElement;
    return {
      currentTarget: track,
      clientX: fraction * TRACK_WIDTH,
      buttons: 0,
    } as unknown as PointerEvent;
  };

  it('counts the span inclusively', () => {
    const component = render(50, 82);

    expect(component.spanLength()).toEqual(33);
    expect(component.summary()).toEqual('33 games');
  });

  it('describes a one-game span in the singular', () => {
    expect(render(41, 41).summary()).toEqual('1 game');
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

  it('offers the minimum-games filter only while the leaderboard is scored per game', () => {
    const fixture = MockRender(GameRangeSelectorComponent, {
      scheduleLength: 82,
      fromGame: 63,
      toGame: 82,
      perGame: false,
      minGames: 1,
    });

    expect(ngMocks.findAll('#min-games')).toHaveLength(0);

    fixture.point.componentInstance.togglePerGame();
    fixture.detectChanges();

    expect(ngMocks.findAll('#min-games')).toHaveLength(1);
  });

  it('toggles the per-game view', () => {
    const component = render();

    component.togglePerGame();

    expect(component.perGame()).toEqual(true);
  });

  it('draws the band between the two handles', () => {
    const component = render(42, 82);

    // 41 of the 81 steps in, and all the way to the end.
    expect(component.fillStyle().left).toContain('50.617%');
    expect(component.fillStyle().right).toContain('0.000%');
  });

  it('insets the band by half a handle so it stays under them at the ends', () => {
    const full = render(1, 82).fillStyle();

    // Both ends sit at 0%, yet the handle centres are half a handle inside the track — so the
    // band has to be pushed in by the same amount rather than reaching the edges.
    expect(full.left).toContain('0.5000 * var(--thumb-size)');
    expect(full.right).toContain('0.5000 * var(--thumb-size)');
  });

  it('raises whichever handle the pointer is nearest, so a narrow range stays draggable', () => {
    const component = render(40, 42);

    component.onTrackHover(hoverAt(0.1));
    expect(component.activeThumb()).toEqual('from');

    component.onTrackHover(hoverAt(0.9));
    expect(component.activeThumb()).toEqual('to');
  });

  it('leaves the handles alone mid-drag, when a press already owns the pointer', () => {
    const component = render(40, 42);
    component.onTrackHover(hoverAt(0.1));

    component.onTrackHover({ ...hoverAt(0.9), buttons: 1 });

    expect(component.activeThumb()).toEqual('from');
  });

  it('names the presets and the rail under them with the same visible label', () => {
    render();

    const label = ngMocks.find('#whos-hot-range-label').nativeElement as HTMLElement;
    const group = ngMocks.find('.range-group').nativeElement as HTMLElement;

    expect(label.textContent.trim()).toEqual('Game range');
    expect(group.getAttribute('role')).toEqual('group');
    // Labelled by the word on screen rather than by an aria-label nobody else can read.
    expect(group.getAttribute('aria-labelledby')).toEqual(label.id);
    expect(group.getAttribute('aria-label')).toEqual(null);
  });

  it('keeps the pills and the rail inside that one group, not beside each other', () => {
    render();

    const group = ngMocks.find('.range-group').nativeElement as HTMLElement;

    // The label governs both halves of the question, so both have to sit under it — the rail
    // used to be a sibling row of the bar with nothing tying it to the name above it.
    expect(group.querySelector('.presets')).toBeTruthy();
    expect(group.querySelector('.range-slider')).toBeTruthy();
  });

  it('names the whole row for everything in it, not just the range on the left of it', () => {
    render();

    const bar = ngMocks.find('.range-bar').nativeElement as HTMLElement;

    // Naming the region 'Game range' would repeat the label inside it and leave the scoring
    // options out of the name.
    expect(bar.getAttribute('aria-label')).toEqual('Game range and scoring options');
  });

  it('leaves the season to the page, so the bar asks one question rather than two', () => {
    render();

    // It framed every number on the page, not just this row, and as a one-line column beside a
    // two-line one it left a hole under itself the height of the rail.
    expect(ngMocks.findAll('select.season-select').length).toEqual(0);
  });
});
