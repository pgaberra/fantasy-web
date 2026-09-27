import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PickablePlayer,
  PlayerPickerComponent,
  matchesPlayerFilter,
  nameMatches,
} from './player-picker';

const POOL: PickablePlayer[] = [
  { id: 1, name: 'Sidney Crosby', teamAbbrev: 'PIT' },
  { id: 2, name: 'Cale Makar', teamAbbrev: 'COL' },
  { id: 3, name: 'Alex Tóth', teamAbbrev: null },
  { id: 4, name: 'Alexander Ovechkin', teamAbbrev: 'WSH' },
];

@Component({
  imports: [PlayerPickerComponent],
  template: `<app-player-picker
      inputId="search"
      [players]="players"
      [(term)]="term"
      [(picked)]="picked"
    />
    <button id="elsewhere">elsewhere</button>`,
})
class HostComponent {
  readonly players = POOL;
  readonly term = signal('');
  readonly picked = signal<readonly number[]>([]);
}

describe('nameMatches', () => {
  it('ignores case and accents', () => {
    expect(nameMatches('Alex Tóth', 'TOTH')).toBe(true);
    expect(nameMatches('Tim Stützle', 'stutz')).toBe(true);
  });

  it('matches everyone on an empty term', () => {
    expect(nameMatches('Cale Makar', '  ')).toBe(true);
  });
});

describe('matchesPlayerFilter', () => {
  it('filters by the term while nobody is picked', () => {
    expect(matchesPlayerFilter(1, 'Sidney Crosby', 'cros', new Set())).toBe(true);
    expect(matchesPlayerFilter(2, 'Cale Makar', 'cros', new Set())).toBe(false);
  });

  it('keeps only the picked players once any are, whatever is typed', () => {
    const picked = new Set([2]);
    expect(matchesPlayerFilter(2, 'Cale Makar', 'cros', picked)).toBe(true);
    expect(matchesPlayerFilter(1, 'Sidney Crosby', 'cros', picked)).toBe(false);
  });
});

describe('PlayerPickerComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HostComponent] }));

  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const box = root.querySelector('input') as HTMLInputElement;
    const type = (text: string) => {
      box.focus();
      box.value = text;
      box.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const key = (name: string) => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: name, cancelable: true }));
      fixture.detectChanges();
    };
    const options = () => [...root.querySelectorAll<HTMLElement>('[role="option"]')];
    return { fixture, root, box, type, key, options, host: fixture.componentInstance };
  }

  it('lists the matching players by name as the term is typed, and passes the term up', () => {
    const { type, options, host, box } = setup();
    type('alex');
    expect(options().map((o) => o.querySelector('.name')!.textContent)).toEqual([
      'Alex Tóth',
      'Alexander Ovechkin',
    ]);
    expect(host.term()).toEqual('alex');
    expect(box.getAttribute('aria-expanded')).toEqual('true');
  });

  it('names the box for screen readers when it has no visible label', () => {
    const { box, root } = setup();
    expect(root.querySelector('label')).toBeNull();
    expect(box.getAttribute('aria-label')).toEqual('Search player');
  });

  it('ticks a player on click, and unticks him on a second', () => {
    const { type, options, host, fixture } = setup();
    type('makar');
    options()[0].click();
    fixture.detectChanges();
    expect(host.picked()).toEqual([2]);
    expect(options()[0].getAttribute('aria-selected')).toEqual('true');

    options()[0].click();
    fixture.detectChanges();
    expect(host.picked()).toEqual([]);
  });

  it('ticks the highlighted player with the arrow keys and Enter', () => {
    const { type, key, host } = setup();
    type('alex');
    key('ArrowDown');
    key('Enter');
    expect(host.picked()).toEqual([4]);
  });

  it('lists the picked players when nothing is typed, so one can be unticked', () => {
    const { type, options, host, fixture } = setup();
    host.picked.set([1, 2]);
    fixture.detectChanges();
    type('');
    expect(options().map((o) => o.querySelector('.name')!.textContent)).toEqual([
      'Sidney Crosby',
      'Cale Makar',
    ]);
  });

  it('says so when nobody matches', () => {
    const { type, root, options } = setup();
    type('zzz');
    expect(options()).toHaveLength(0);
    expect(root.querySelector('.none')?.textContent).toContain('No players found');
  });

  it('closes the list on Escape, keeping the term while nobody is picked', () => {
    const { type, key, root, host } = setup();
    type('alex');
    key('Escape');
    expect(root.querySelector('[role="listbox"]')).toBeNull();
    expect(host.term()).toEqual('alex');
  });

  it('empties the box as the list closes once players are picked', () => {
    const { type, root, host, fixture } = setup();
    type('makar');
    root.querySelector<HTMLElement>('[role="option"]')!.click();
    root.querySelector<HTMLButtonElement>('#elsewhere')!.focus();
    fixture.detectChanges();
    expect(root.querySelector('[role="listbox"]')).toBeNull();
    expect(host.term()).toEqual('');
    expect(host.picked()).toEqual([2]);
  });

  it('counts the picked players on a button that clears them', () => {
    const { host, fixture, root } = setup();
    host.picked.set([1, 2]);
    fixture.detectChanges();
    const clear = root.querySelector<HTMLButtonElement>('.picked')!;
    expect(clear.textContent).toContain('2 players');

    clear.click();
    fixture.detectChanges();
    expect(host.picked()).toEqual([]);
    expect(root.querySelector('.picked')).toBeNull();
  });
});
