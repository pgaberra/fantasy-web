/**
 * The shape of a public name, mirroring the server's rule (`^[A-Za-z0-9_]{3,20}$` there — `\w`
 * is the same set). Validating here is a courtesy: the BFF and db-service both re-check it, but
 * it saves a round trip to be told that a space is not allowed.
 */
export const USERNAME_PATTERN = /^\w{3,20}$/;
export const USERNAME_MAX_LENGTH = 20;

/**
 * Said only once the name typed breaks the rule, rather than standing under the field from the
 * start: the rule is unremarkable enough that most names meet it without being told, and the one
 * moment it is worth reading is the moment it has been broken. So it has to state the whole rule
 * on its own — there is no hint left above it to lean on.
 */
export const USERNAME_RULE =
  'Username must be 3–20 characters and may contain only letters, numbers, and underscores.';
