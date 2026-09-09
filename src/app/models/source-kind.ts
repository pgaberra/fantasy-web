/**
 * Where a board's numbers come from, as the two pages that ask it word the question.
 *
 * <p>`draft-start` asks "what do you want to draft against" and `projection-create` asks "what
 * does this projection start from", and the answer is the same three groups: something the
 * product ships, something the user made, something someone shared. They are defined here
 * rather than once per page so the two cannot drift into calling the same group two things.
 */
export type SourceKind = 'preset' | 'projection' | 'imported';

/** One of the three answers, named short enough for a segment of a pill. */
export interface SourceKindOption {
  readonly kind: SourceKind;
  readonly name: string;
}

export const SOURCE_KINDS: readonly SourceKindOption[] = [
  { kind: 'preset', name: 'Preset' },
  { kind: 'projection', name: 'Your projection' },
  { kind: 'imported', name: 'Imports' },
];
