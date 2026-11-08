import {TRPCError} from "@trpc/server";

/** Conservative server window for foreground field GPS, allowing clock skew.
 * This is defense in depth, NOT device attestation, anti-spoofing or native
 * background GPS approval. Client controls remain more restrictive.
 */
export const MAX_LOCATION_SAMPLE_AGE_MS=120_000;
export const MAX_LOCATION_FUTURE_SKEW_MS=30_000;

export function assertRecentTeamLocation(capturedAt:Date,nowMs=Date.now()):void{
  const capturedMs=capturedAt instanceof Date?capturedAt.getTime():NaN;
  if(!Number.isFinite(nowMs)||!Number.isFinite(capturedMs)||
     capturedMs<0||nowMs<0||
     capturedMs<nowMs-MAX_LOCATION_SAMPLE_AGE_MS||
     capturedMs>nowMs+MAX_LOCATION_FUTURE_SKEW_MS){
    throw new TRPCError({
      code:"BAD_REQUEST",
      message:"A posição está fora da janela temporal segura. Capture uma nova localização."
    });
  }
}
