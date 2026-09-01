import { validateRecoveryPreflight } from "./server/recovery/recoveryEnvironment";

export default async function setupRecoveryEnvironment(): Promise<void> {
  await validateRecoveryPreflight(process.env);
}
