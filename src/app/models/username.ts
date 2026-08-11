/**
 * The shape of a public name, mirroring the server's rule (`^[A-Za-z0-9_]{3,20}$` there — `\w`
 * is the same set). Validating here is a courtesy: the BFF and db-service both re-check it, but
 * it saves a round trip to be told that a space is not allowed.
 */
export const USERNAME_PATTERN = /^\w{3,20}$/;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_RULE = '3–20 characters: letters, digits and underscores.';
