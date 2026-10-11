import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TeamLogoComponent, teamLogoUrl } from './team-logo';

describe('teamLogoUrl', () => {
  it("points at the NHL's crest under the club's own spelling, whatever the platform's", () => {
    expect(teamLogoUrl('EDM')).toBe('https://assets.nhle.com/logos/nhl/svg/EDM_light.svg');
    expect(teamLogoUrl('TB')).toBe('https://assets.nhle.com/logos/nhl/svg/TBL_light.svg');
    expect(teamLogoUrl('utah')).toBe('https://assets.nhle.com/logos/nhl/svg/UTA_light.svg');
  });

  it('is nothing for no club', () => {
    expect(teamLogoUrl(undefined)).toBeUndefined();
    expect(teamLogoUrl('  ')).toBeUndefined();
  });
});

describe('TeamLogoComponent', () => {
  let fixture: ComponentFixture<TeamLogoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TeamLogoComponent] }).compileComponents();
    fixture = TestBed.createComponent(TeamLogoComponent);
  });

  function render(team: string | undefined, alt?: string): void {
    fixture.componentRef.setInput('team', team);
    if (alt !== undefined) {
      fixture.componentRef.setInput('alt', alt);
    }
    fixture.detectChanges();
  }

  function image(): HTMLImageElement | null {
    return fixture.nativeElement.querySelector('img');
  }

  it('draws the crest, decorative beside the written club', () => {
    render('EDM');

    expect(image()?.getAttribute('src')).toBe(
      'https://assets.nhle.com/logos/nhl/svg/EDM_light.svg',
    );
    expect(image()?.getAttribute('alt')).toBe('');
  });

  it('names the club when told what the crest stands for', () => {
    render('EDM', 'Edmonton Oilers');

    expect(image()?.getAttribute('alt')).toBe('Edmonton Oilers');
  });

  it('shows the abbreviation in a badge when the crest fails to load', () => {
    render('EDM');

    image()?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(image()).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe('EDM');
    expect(fixture.nativeElement.querySelector('.badge')?.getAttribute('aria-hidden')).toBe('true');
  });

  // The crests are recycled down a long table: a row whose crest once failed must not keep
  // showing a badge for the next club it draws.
  it('tries again when it is handed a different club', () => {
    render('EDM');
    image()?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    render('CGY');

    expect(image()?.getAttribute('src')).toBe(
      'https://assets.nhle.com/logos/nhl/svg/CGY_light.svg',
    );
  });

  it('shows an empty badge for no club at all', () => {
    render(undefined);

    expect(image()).toBeNull();
    expect(fixture.nativeElement.querySelector('.badge')).not.toBeNull();
  });
});
