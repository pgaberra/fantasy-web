import { Component, input } from '@angular/core';

/**
 * Positions as coloured chips, one colour per position (the `pos--*` system in styles.css). The
 * one way the app draws a player's positions, on the draft board and in the projection editor
 * alike, so a centre reads the same colour wherever he appears.
 */
@Component({
  selector: 'app-position-chips',
  template: `@for (position of positions(); track position) {
    <span [class]="'pos-chip pos--' + position.toLowerCase()">{{ position }}</span>
  }`,
  styleUrl: './position-chips.css',
})
export class PositionChipsComponent {
  readonly positions = input.required<readonly string[]>();
}
