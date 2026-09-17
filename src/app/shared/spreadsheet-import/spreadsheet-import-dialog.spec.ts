import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { SpreadsheetImportDialogComponent } from './spreadsheet-import-dialog';
import { POOL } from './spreadsheet-test-players';

describe('SpreadsheetImportDialogComponent', () => {
  beforeEach(() => MockBuilder(SpreadsheetImportDialogComponent));

  const render = () => {
    const fixture = MockRender(SpreadsheetImportDialogComponent, { players: POOL });
    return { fixture, component: fixture.point.componentInstance };
  };

  /** Picks a CSV file holding these cells, which is how every sheet reaches the dialog now. */
  const pick = (component: SpreadsheetImportDialogComponent, text: string, name = 'sheet.csv') =>
    component.onFilePicked({
      target: { files: [new File([text], name)], value: name },
    } as unknown as Event);

  const select = (value: string) => ({ target: { value } }) as unknown as Event;

  it('reads a file, proposes the columns and counts the players it finds', async () => {
    const { fixture, component } = render();
    await pick(
      component,
      'Player\tTeam\tG\tA\nNathan MacKinnon\tCOL\t44\t84\nNobody Here\tEDM\t1\t1\n',
    );
    fixture.detectChanges();

    expect(component.step()).toBe('columns');
    expect(component.columns().map((column) => column.value)).toEqual([
      'name',
      'team',
      'goals',
      'assists',
    ]);
    expect(component.plan()?.stats.get(1)).toEqual({ goals: 44, assists: 84 });
    expect(component.notFound()).toEqual(['Nobody Here']);
    expect(ngMocks.formatText(ngMocks.find('.summary-line'))).toBe('1 of 2 players found.');
  });

  it('gives a role to one column at a time', async () => {
    const { component } = render();
    await pick(component, 'Player\tG\tGoals\nNathan MacKinnon\t44\t45\n');

    component.onColumnRoleChange(2, select('goals'));

    expect(component.roles()).toEqual([{ kind: 'name' }, null, { kind: 'stat', stat: 'goals' }]);
    expect(component.plan()?.stats.get(1)).toEqual({ goals: 45 });
  });

  it('asks for a names column and a stat before it can import', async () => {
    const { component } = render();
    await pick(component, 'Player\tG\nNathan MacKinnon\t44\n');

    component.onColumnRoleChange(1, select(''));
    expect(component.canImport()).toBe(false);
    component.onColumnRoleChange(1, select('goals'));
    component.onColumnRoleChange(0, select(''));
    expect(component.hasNameColumn()).toBe(false);
    expect(component.canImport()).toBe(false);
  });

  it('re-reads the columns from the heading row the user names', async () => {
    const { component } = render();
    await pick(component, 'My sheet\nPlayer\tG\nNathan MacKinnon\t44\n');
    expect(component.headingRow()).toBe(1);

    component.onHeadingRowChange(select('1'));
    expect(component.headingRow()).toBe(0);
    component.onHeadingRowChange(select('9'));
    expect(component.headingRow()).toBe(0);
  });

  it('says why a file could not be read, and stays on the first step', async () => {
    const { component } = render();
    const file = new File(['x'], 'old.xls');
    await component.onFilePicked({
      target: { files: [file], value: 'old.xls' },
    } as unknown as Event);

    expect(component.step()).toBe('source');
    expect(component.readError()).toContain('.xls');
  });

  it('imports a name that fits two players once the user picks one', async () => {
    const { fixture, component } = render();
    await pick(component, 'Player\tTeam\tG\nElias Pettersson\tVAN\t20\n');
    fixture.detectChanges();

    expect(component.ambiguous().map((row) => row.name)).toEqual(['Elias Pettersson']);
    expect(component.canImport()).toBe(false);

    component.onChoice(0, select('11'));
    expect(component.plan()?.stats.get(11)).toEqual({ goals: 20 });
    expect(component.canImport()).toBe(true);

    component.onChoice(0, select(''));
    expect(component.canImport()).toBe(false);
  });

  it('lists a name matched through another spelling, and can leave it out', async () => {
    const { fixture, component } = render();
    await pick(component, 'Player\tG\nTommy Novak\t18\nNathan MacKinnon\t44\n');
    fixture.detectChanges();

    expect(component.respelled().map((row) => row.player.name)).toEqual(['Thomas Novak']);
    expect(component.plan()?.stats.get(13)).toEqual({ goals: 18 });

    component.onChoice(0, select(''));
    expect(component.plan()?.stats.has(13)).toBe(false);
    expect(component.plan()?.stats.size).toBe(1);
  });

  it('labels a candidate with its club and position', () => {
    const { component } = render();
    expect(component.candidateLabel(POOL.find((player) => player.id === 11)!)).toBe(
      'Elias Pettersson · VAN · D',
    );
  });

  it('emits the plan with the name on confirm', async () => {
    const { component } = render();
    const emit = vi.spyOn(component.imported, 'emit');
    await pick(component, 'Player\tG\nNathan MacKinnon\t44\n');
    expect(component.name()).toBe('sheet');

    component.onNameInput(select('  My sheet  '));
    component.confirm();

    expect(emit).toHaveBeenCalledWith({ plan: component.plan(), name: 'My sheet' });
  });

  it('names the import after the file it was read from', async () => {
    const { component } = render();
    const file = new File(['Player,G\nNathan MacKinnon,44\n'], 'Apples & Ginos 2024-25.csv');
    await component.onFilePicked({ target: { files: [file], value: '' } } as unknown as Event);

    expect(component.name()).toBe('Apples & Ginos 2024-25');
  });

  it('will not import without a name, or a second time while saving', async () => {
    const fixture = MockRender(SpreadsheetImportDialogComponent, { players: POOL, saving: true });
    const component = fixture.point.componentInstance;
    const emit = vi.spyOn(component.imported, 'emit');
    await pick(component, 'Player\tG\nNathan MacKinnon\t44\n');

    component.confirm();
    expect(emit).not.toHaveBeenCalled();

    component.onNameInput(select(' '));
    expect(component.canImport()).toBe(false);
  });
});
