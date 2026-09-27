import {
  Component,
  ElementRef,
  computed,
  input,
  linkedSignal,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { IconComponent } from '../icon/icon';
import { TooltipDirective } from '../tooltip/tooltip.directive';

/** What the picker needs to know of a player to list him. */
export interface PickablePlayer {
  readonly id: number;
  readonly name: string;
  readonly teamAbbrev?: string | null;
}

/** Enough to find anyone by a few letters, without a list so long it stops being a shortlist. */
const MAX_OPTIONS = 50;

/** Lower case with the accents taken off, so "toth" finds Tóth and "stutzle" finds Stützle. */
function folded(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Whether a name holds the typed term, by the same rule the picker lists names by. */
export function nameMatches(name: string, term: string): boolean {
  const wanted = folded(term.trim());
  return !wanted || folded(name).includes(wanted);
}

/**
 * Which rows a table shows by name: only the picked players while any are picked, and otherwise
 * those whose name holds the typed term. While players are picked the term is only a search for
 * the next one, so typing it must not narrow the table away from the ones already chosen.
 */
export function matchesPlayerFilter(
  playerId: number,
  name: string,
  term: string,
  picked: ReadonlySet<number>,
): boolean {
  return picked.size > 0 ? picked.has(playerId) : nameMatches(name, term);
}

/**
 * The tables' search box, with a list under it to tick players into the table one by one.
 *
 * Typing still narrows the table by name, as the box always has. Ticking a name in the list below
 * it is the other way in: the table then shows the ticked players and nobody else, so a handful
 * of players from anywhere in the pool can be set side by side. The other filters still apply on
 * top, as they do to a search.
 */
@Component({
  selector: 'app-player-picker',
  imports: [IconComponent, TooltipDirective],
  templateUrl: './player-picker.html',
  styleUrl: './player-picker.css',
  host: { '(focusout)': 'onFocusOut($event)' },
})
export class PlayerPickerComponent {
  readonly players = input.required<readonly PickablePlayer[]>();
  readonly inputId = input.required<string>();
  /** A visible "Search" beside the box, where the page has always had one. */
  readonly showLabel = input(false);

  readonly term = model.required<string>();
  readonly picked = model.required<readonly number[]>();

  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  readonly open = signal(false);

  readonly pickedIds = computed(() => new Set(this.picked()));

  /**
   * The names under the box: those holding the typed term, or with nothing typed the players
   * already picked, so one can be unticked without remembering how he was found.
   */
  readonly options = computed<readonly PickablePlayer[]>(() => {
    const term = this.term().trim();
    const players = this.players();
    if (!term) {
      const byId = new Map(players.map((player) => [player.id, player]));
      return this.picked()
        .map((id) => byId.get(id))
        .filter((player): player is PickablePlayer => !!player);
    }
    return players
      .filter((player) => nameMatches(player.name, term))
      .sort((first, second) => first.name.localeCompare(second.name))
      .slice(0, MAX_OPTIONS);
  });

  /** The option the arrow keys are on, back at the top whenever the list changes under it. */
  readonly active = linkedSignal({ source: this.options, computation: () => 0 });

  /** Once someone is picked, the box is for finding the next one. */
  readonly placeholder = computed(() => (this.picked().length ? 'Add player…' : 'Search player…'));

  readonly listId = computed(() => `${this.inputId()}-options`);

  readonly expanded = computed(
    () => this.open() && (this.options().length > 0 || this.term().trim() !== ''),
  );

  optionId(player: PickablePlayer): string {
    return `${this.inputId()}-option-${player.id}`;
  }

  readonly activeOptionId = computed(() => {
    const option = this.options()[this.active()];
    return this.expanded() && option ? this.optionId(option) : null;
  });

  onInput(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
    this.open.set(true);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) {
          this.open.set(true);
        } else if (count) {
          this.active.update((index) => (index + 1) % count);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) {
          this.active.update((index) => (index - 1 + count) % count);
        }
        break;
      case 'Enter': {
        const option = this.options()[this.active()];
        if (this.expanded() && option) {
          event.preventDefault();
          this.toggle(option.id);
        }
        break;
      }
      case 'Escape':
        // A first Escape closes the list; the browser's own, which empties a search box, is left
        // for the second.
        if (this.expanded()) {
          event.preventDefault();
          this.close();
        }
        break;
    }
  }

  toggle(playerId: number): void {
    this.picked.update((ids) =>
      ids.includes(playerId) ? ids.filter((id) => id !== playerId) : [...ids, playerId],
    );
    // The typed name stays, since a few letters can find several players worth ticking, but it is
    // selected, so typing the next name replaces it rather than running on from it.
    const box = this.box().nativeElement;
    box.focus();
    box.select();
  }

  clear(): void {
    this.picked.set([]);
    this.open.set(false);
  }

  /** Closes the list once focus leaves the box and the list together, and not before. */
  onFocusOut(event: FocusEvent): void {
    const host = (event.currentTarget as HTMLElement | null) ?? null;
    const next = event.relatedTarget as Node | null;
    if (!host || !next || !host.contains(next)) {
      this.close();
    }
  }

  /**
   * While players are picked the typed name was only ever a way to find one, and it narrows
   * nothing, so it goes with the list rather than sit in the box looking like a filter.
   */
  private close(): void {
    this.open.set(false);
    if (this.picked().length) {
      this.term.set('');
    }
  }
}
