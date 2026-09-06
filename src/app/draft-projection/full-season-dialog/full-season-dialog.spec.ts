import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { FullSeasonDialogComponent } from './full-season-dialog';

describe('FullSeasonDialogComponent', () => {
  beforeEach(() => MockBuilder(FullSeasonDialogComponent));

  const getComponent = () => MockRender(FullSeasonDialogComponent).point.componentInstance;

  it('defaults to scaling on with a 20-game minimum, and to leaving goalies alone', () => {
    const component = getComponent();
    expect(component.scaleStats()).toEqual(true);
    expect(component.minGamesToScale()).toEqual(20);
    expect(component.scaleGoalies()).toEqual(false);
  });

  it('toggles the goalie option on and off', () => {
    const component = getComponent();
    component.toggleScaleGoalies();
    expect(component.scaleGoalies()).toEqual(true);
    component.toggleScaleGoalies();
    expect(component.scaleGoalies()).toEqual(false);
  });

  it('toggles scaling on and off', () => {
    const component = getComponent();
    component.toggleScaleStats();
    expect(component.scaleStats()).toEqual(false);
    component.toggleScaleStats();
    expect(component.scaleStats()).toEqual(true);
  });

  it('clamps a negative minimum to 0 and rounds', () => {
    const component = getComponent();
    component.onMinGamesInput({ target: { value: '-5' } } as unknown as Event);
    expect(component.minGamesToScale()).toEqual(0);
    component.onMinGamesInput({ target: { value: '18.6' } } as unknown as Event);
    expect(component.minGamesToScale()).toEqual(19);
  });

  it('emits the chosen config on confirm', () => {
    const component = getComponent();
    const emit = vi.spyOn(component.confirm, 'emit');
    component.onMinGamesInput({ target: { value: '25' } } as unknown as Event);
    component.onConfirm();
    expect(emit).toHaveBeenCalledWith({
      scaleStats: true,
      minGamesToScale: 25,
      scaleGoalies: false,
    });
  });

  it('emits scaleStats false when scaling is turned off', () => {
    const component = getComponent();
    const emit = vi.spyOn(component.confirm, 'emit');
    component.toggleScaleStats();
    component.onConfirm();
    expect(emit).toHaveBeenCalledWith({
      scaleStats: false,
      minGamesToScale: 20,
      scaleGoalies: false,
    });
  });

  it('emits scaleGoalies true once the goalie option is ticked', () => {
    const component = getComponent();
    const emit = vi.spyOn(component.confirm, 'emit');
    component.toggleScaleGoalies();
    component.onConfirm();
    expect(emit).toHaveBeenCalledWith({
      scaleStats: true,
      minGamesToScale: 20,
      scaleGoalies: true,
    });
  });

  it('shows the minimum-games input only while scaling is on', () => {
    const fixture = MockRender(FullSeasonDialogComponent);
    expect(ngMocks.findAll('.min-games-row')).toHaveLength(1);
    fixture.point.componentInstance.toggleScaleStats();
    fixture.detectChanges();
    expect(ngMocks.findAll('.min-games-row')).toHaveLength(0);
  });

  it('warns only once the goalie option is ticked', () => {
    const fixture = MockRender(FullSeasonDialogComponent);
    expect(ngMocks.findAll('.option-warning')).toHaveLength(0);
    fixture.point.componentInstance.toggleScaleGoalies();
    fixture.detectChanges();
    const warning = ngMocks.find('.option-warning');
    expect(warning.nativeElement.textContent).toContain('82-game season');
    expect(warning.nativeElement.getAttribute('role')).toEqual('alert');
  });
});
