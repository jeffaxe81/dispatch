/**
 * Converts a user-facing search into an SQL LIKE substring pattern where
 * "%" and "_" are literal characters, never unbounded wildcards.
 *
 * MySQL queries MUST include ESCAPE '!' (rather than assuming connection-
 * specific backslash escaping). Values remain bound through Drizzle sql tags.
 */
export function incidentLiteralSearchPattern(input: string): string {
  const term = input.trim();
  return "%" + term.replace(/[!%_]/g, character => "!" + character) + "%";
}
