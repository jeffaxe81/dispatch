import { useEffect, useState } from "react";

const STORAGE_KEY = "dispatch.refresh-interval-ms";
export const refreshOptions = [
  { value: 5_000, label: "A cada 5 segundos" },
  { value: 10_000, label: "A cada 10 segundos" },
  { value: 30_000, label: "A cada 30 segundos" },
  { value: 60_000, label: "A cada 1 minuto" },
  { value: 0, label: "Somente manual" },
] as const;

export function formatRefreshInterval(interval: number) {
  if (!interval) return "Manual";
  return interval < 60_000 ? `${interval / 1_000} s` : "1 min";
}

export function resolveRefreshInterval(saved: number) {
  return refreshOptions.some(option => option.value === saved) ? saved : 10_000;
}

export function useRefreshSettings() {
  const [interval, setIntervalValue] = useState(() => {
    if (typeof window === "undefined") return 10_000;
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    return resolveRefreshInterval(saved);
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(interval));
  }, [interval]);

  return { interval, setInterval: setIntervalValue, label: formatRefreshInterval(interval) };
}
