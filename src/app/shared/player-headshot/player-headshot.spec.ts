import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayerHeadshotComponent } from './player-headshot';

describe('PlayerHeadshotComponent', () => {
  let fixture: ComponentFixture<PlayerHeadshotComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerHeadshotComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(PlayerHeadshotComponent);
  });

  function render(src: string | undefined, name: string): void {
    fixture.componentRef.setInput('src', src);
    fixture.componentRef.setInput('name', name);
    fixture.detectChanges();
  }

  function image(): HTMLImageElement | null {
    return fixture.nativeElement.querySelector('img');
  }

  it('shows the picture when there is one', () => {
    render('https://cdn.test/mcdavid.png', 'Connor McDavid');

    expect(image()?.getAttribute('src')).toEqual('https://cdn.test/mcdavid.png');
    expect(image()?.getAttribute('alt')).toEqual('Connor McDavid');
  });

  it('shows initials when there is no picture', () => {
    render(undefined, 'Connor McDavid');

    expect(image()).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toEqual('CM');
  });

  it('falls back to initials when the picture fails to load', () => {
    render('https://cdn.test/gone.png', 'Igor Shesterkin');

    image()?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(image()).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toEqual('IS');
  });

  // The rows are recycled down a long table: a row that once failed must not keep showing
  // initials for the next player it draws.
  it('tries again when it is handed a different player', () => {
    render('https://cdn.test/gone.png', 'Igor Shesterkin');
    image()?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    render('https://cdn.test/mcdavid.png', 'Connor McDavid');

    expect(image()?.getAttribute('src')).toEqual('https://cdn.test/mcdavid.png');
  });

  it('copes with a single-word name', () => {
    render(undefined, 'Ovechkin');

    expect(fixture.nativeElement.textContent.trim()).toEqual('O');
  });
});
