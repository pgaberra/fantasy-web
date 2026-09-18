import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Where a copy of a published board lands: open for editing, or straight into a draft. */
export type ImportDestination = 'projection' | 'draft';

/** The press, as it is written down: which board, which of the two buttons, and which version. */
interface StoredCopy {
  readonly token: string;
  readonly destination: ImportDestination;
  /** The board's stamp as the visitor saw it before leaving to sign up; absent from older entries. */
  readonly seenUpdatedAt?: string;
}

/** What a press picked back up asks for. */
export interface PendingCopy {
  readonly destination: ImportDestination;
  readonly seenUpdatedAt?: string;
}

/**
 * A press on a shared board that could not be acted on yet, held across the trip to the account
 * form and back.
 *
 * <p>It used to ride on the return URL as `?action=draft`, which made the press something a URL
 * could assert. Anyone who sent `/s/<token>?action=draft` to a signed-in reader had their account
 * take a copy of a board they had not asked for, and drop them into a draft against it — a link
 * that looked like "read this" behaved like "start a draft". Written down here instead, there is
 * no parameter to forward: a shared link is a shared link, and the copy happens because somebody
 * pressed a button in this tab.
 *
 * <p>sessionStorage rather than a field, for the same reason AuthService keeps the return URL
 * there: the visitor leaves the app entirely — to Google and back, or through a page reload — and
 * a press held in memory would not survive it. It is per tab and dies with it, which is the right
 * lifetime for "what I was in the middle of".
 */
@Injectable({ providedIn: 'root' })
export class PendingCopyService {
  /** None while a page is prerendered at build time, where there is no visitor and no press. */
  private readonly session: Storage | null = isPlatformBrowser(inject(PLATFORM_ID))
    ? sessionStorage
    : null;

  private readonly key = 'shared_copy_intent';

  /**
   * @param seenUpdatedAt the board's stamp when the button was pressed. The trip to the account
   *     form can take minutes, and the copy made on return has to be of the board they pressed on.
   */
  remember(token: string, destination: ImportDestination, seenUpdatedAt?: string): void {
    this.session?.setItem(
      this.key,
      JSON.stringify({ token, destination, seenUpdatedAt } satisfies StoredCopy),
    );
  }

  /**
   * The press, once, and only for the board it was made on. Taking it clears it: a copy is the
   * answer to one press, and a second board — or a second visit — is not that press.
   *
   * <p>The stored value is read back as warily as the URL parameter it replaces. It is a string
   * in the visitor's own browser, so nothing here is a trust boundary, but a shape this code does
   * not recognise should leave the board on screen rather than throw on the way to rendering it.
   */
  take(token: string): PendingCopy | null {
    const stored = this.session?.getItem(this.key);
    if (!stored) {
      return null;
    }
    this.session?.removeItem(this.key);
    const pending = this.parse(stored);
    if (pending?.token !== token) {
      return null;
    }
    return { destination: pending.destination, seenUpdatedAt: pending.seenUpdatedAt };
  }

  private parse(stored: string): StoredCopy | null {
    let value: unknown;
    try {
      value = JSON.parse(stored);
    } catch {
      return null;
    }
    const { token, destination, seenUpdatedAt } = (value ?? {}) as Partial<StoredCopy>;
    if (typeof token !== 'string' || (destination !== 'draft' && destination !== 'projection')) {
      return null;
    }
    // A stamp that is not a string is dropped rather than the press: the copy then takes the
    // board as it is, which is what every press did before stamps were written down.
    return {
      token,
      destination,
      seenUpdatedAt: typeof seenUpdatedAt === 'string' ? seenUpdatedAt : undefined,
    };
  }
}
