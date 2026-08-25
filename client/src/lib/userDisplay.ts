export type UserIdentity = {
  profile?: { displayName: string | null } | null;
  user: { name: string | null; email: string | null; loginMethod: string | null };
};

export function getUserDisplayName(input: UserIdentity) {
  const value = input.profile?.displayName?.trim() || input.user.name?.trim();
  if (value) return value;
  const emailPrefix = input.user.email?.split("@")[0]?.trim();
  return emailPrefix || "Usuário sem identificação nominal";
}

export function getUserSecondaryIdentity(input: UserIdentity) {
  if (input.user.email) return input.user.email;
  if (input.user.loginMethod === "preprovisioned") return "Pré-cadastro manual — aguardando vinculação de identidade";
  return "Identidade corporativa não sincronizada";
}
