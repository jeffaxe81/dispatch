/**
 * AXED-F016: a priority change is a distinct, auditable decision.
 * No reason is required for unrelated incident edits or unchanged priority.
 */
export function requirePriorityChangeJustification(
  previous: string,
  next: string | undefined,
  rawReason?: string | null,
): string | null {
  if (next === undefined || next === previous) return null;
  const reason = rawReason?.trim() ?? "";
  if (reason.length < 5 || reason.length > 500)
    throw new Error("Ao alterar a prioridade, registre justificativa entre 5 e 500 caracteres.");
  return reason;
}
