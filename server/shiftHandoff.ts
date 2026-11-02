export const HANDOFF_WINDOW_MS = 8 * 60 * 60 * 1000;

export function assertShiftHandoffRequest(input: {
  actorUserId: number;
  teamId: number | null;
  recipient: { id: number; teamId: number | null; active: boolean } | null;
  session: { status: string; teamId: number | null } | null;
  note: string;
}): string {
  if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0 ||
      !Number.isSafeInteger(input.teamId) || !input.teamId) throw new Error("Equipe e usuário autenticados obrigatórios.");
  if (!input.session || !["active", "paused"].includes(input.session.status) ||
      input.session.teamId !== input.teamId) throw new Error("Jornada própria ativa ou pausada obrigatória.");
  if (!input.recipient || !input.recipient.active || input.recipient.teamId !== input.teamId ||
      input.recipient.id === input.actorUserId) throw new Error("Responsável de destino deve estar ativo na mesma equipe.");
  const note = input.note.trim();
  if (note.length < 10 || note.length > 1000) throw new Error("Informe motivo operacional de 10 a 1000 caracteres.");
  return note;
}

export function assertShiftHandoffConfirmation(input: {
  actorUserId: number; teamId: number;
  request: { recipientUserId: number; teamId: number; occurredAt: Date } | null;
  now: Date; alreadyConfirmed: boolean;
}) {
  if (!input.request || input.request.recipientUserId !== input.actorUserId ||
      input.request.teamId !== input.teamId) throw new Error("Passagem de plantão fora do seu escopo.");
  if (input.alreadyConfirmed) throw new Error("Passagem de plantão já confirmada.");
  const age = input.now.getTime() - input.request.occurredAt.getTime();
  if (!Number.isFinite(age) || age < 0 || age > HANDOFF_WINDOW_MS) throw new Error("Confirmação de plantão expirada.");
}
