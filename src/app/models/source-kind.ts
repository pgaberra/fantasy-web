/**
 * Where a board's numbers come from, as the two pages that ask it word the question.
 *
 * <p>`draft-start` asks "what do you want to draft against" and `projection-create` asks "what
 * does this projection start from", and the answer is the same three groups: something the
 * product ships, something the user has, something someone else publishes. They are defined here
 * rather than once per page so the two cannot drift into calling the same group two things.
 */
export type SourceKind = 'preset' | 'projection' | 'following';

/** One of the three answers, named short enough for a segment of a pill. */
export interface SourceKindOption {
  readonly kind: SourceKind;
  readonly name: string;
}

export const SOURCE_KINDS: readonly SourceKindOption[] = [
  { kind: 'preset', name: 'Preset' },
  { kind: 'projection', name: 'Your projection' },
  { kind: 'following', name: 'Following' },
];

/** The one field the split is made on, on a summary or a full projection alike. */
interface MaybeFollowed {
  readonly origin?: { readonly authorUsername: string } | null;
}

/**
 * Whether a row is somebody else's board rather than the user's own.
 *
 * <p>`kind` cannot answer this and never could: a copy taken from a share link is stored as the
 * user's own `projection`, and a spreadsheet the user uploaded is stored as `imported` while
 * being every bit as much theirs to edit. Only `origin` marks the one row the user does not own,
 * so the question is asked here once rather than four times with `kind` standing in for it.
 */
export function isFollowedBoard(projection: MaybeFollowed): boolean {
  return projection.origin != null;
}

/** Everything else: what the user made, copied, or uploaded, all of it theirs to edit. */
export function isOwnBoard(projection: MaybeFollowed): boolean {
  return !isFollowedBoard(projection);
}
