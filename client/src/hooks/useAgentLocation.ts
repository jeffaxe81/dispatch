import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";

const REPORT_INTERVAL_MS = 20_000;

export function shouldReportLocation(lastSentAt: number, currentTime: number) {
  return currentTime - lastSentAt >= REPORT_INTERVAL_MS;
}

export function useAgentLocation(teamId: number | null | undefined, enabled: boolean) {
  const [state, setState] = useState<"idle" | "requesting" | "sharing" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const latestPosition = useRef<GeolocationPosition | null>(null);
  const lastSentAt = useRef(0);
  const mutation = trpc.teams.recordLocation.useMutation({
    onError: error => {
      setState("error");
      setMessage(error.message || "Não foi possível enviar a localização.");
    },
  });

  useEffect(() => {
    if (!enabled || !teamId) {
      setState("idle");
      setMessage("");
      return;
    }
    if (!navigator.geolocation) {
      setState("error");
      setMessage("Este dispositivo não disponibiliza geolocalização.");
      return;
    }

    const sendLatest = () => {
      const position = latestPosition.current;
      if (!position || mutation.isPending) return;
      lastSentAt.current = Date.now();
      mutation.mutate({
        teamId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        speedMetersPerSecond: position.coords.speed ?? undefined,
        headingDegrees: position.coords.heading ?? undefined,
        capturedAt: new Date(position.timestamp),
      });
    };

    setState("requesting");
    const watchId = navigator.geolocation.watchPosition(
      position => {
        latestPosition.current = position;
        setState("sharing");
        setMessage(`Última captura às ${new Date(position.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`);
        if (shouldReportLocation(lastSentAt.current, Date.now())) sendLatest();
      },
      error => {
        setState("error");
        setMessage(error.message || "Permissão de localização não concedida.");
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, mutation, teamId]);

  return { state, message, isSending: mutation.isPending };
}
