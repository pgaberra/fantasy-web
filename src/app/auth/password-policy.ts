export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export interface PasswordRequirement {
  readonly key: string;
  readonly label: string;
  readonly isMet: (password: string) => boolean;
}

/**
 * The account-password policy, shared by the register and reset-password forms and mirrored
 * server-side by the BFF's `@StrongPassword` constraint. A deliberately moderate,
 * industry-standard baseline: a minimum length plus a mix of character classes. The frontend
 * checks are a UX convenience — the BFF re-validates every request regardless.
 */
export const PASSWORD_REQUIREMENTS: readonly PasswordRequirement[] = [
  {
    key: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    isMet: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    key: 'uppercase',
    label: 'An uppercase letter (A-Z)',
    isMet: (password) => /[A-Z]/.test(password),
  },
  {
    key: 'lowercase',
    label: 'A lowercase letter (a-z)',
    isMet: (password) => /[a-z]/.test(password),
  },
  {
    key: 'number',
    label: 'A number (0-9)',
    isMet: (password) => /\d/.test(password),
  },
];

export function unmetPasswordRequirements(password: string): readonly PasswordRequirement[] {
  return PASSWORD_REQUIREMENTS.filter((requirement) => !requirement.isMet(password));
}

export function meetsPasswordPolicy(password: string): boolean {
  return unmetPasswordRequirements(password).length === 0;
}
