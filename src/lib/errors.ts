/** Bad input, missing id, claim conflict — exit code 1. */
export class UserError extends Error {}

/** Corrupt storage, lock contention, IO failure — exit code 2. */
export class IntegrityError extends Error {}
