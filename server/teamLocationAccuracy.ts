import { TRPCError } from "@trpc/server";

/**
 * Foreground GPS quality threshold for operational map positions.
 * Older clients may omit accuracyMeters. Such samples remain accepted for
 * compatibility, but must not be interpreted as verified high-precision GPS.
 * This threshold requires operational sign-off before production.
 */
export const MAX_REPORTED_GPS_ACCURACY_METERS = 250;

export function assertAcceptableTeamLocationAccuracy(
  accuracyMeters: number | undefined
): void {
  if (accuracyMeters === undefined) return;
  if (
    !Number.isFinite(accuracyMeters) ||
    accuracyMeters < 0 ||
    accuracyMeters > MAX_REPORTED_GPS_ACCURACY_METERS
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "A precisão estimada do GPS é insuficiente para atualizar a posição operacional. Capture uma nova localização.",
    });
  }
}
