import { useEffect, useState } from "react";

export function useNetworkStatus() {
  const [state, setState] = useState<"online" | "offline" | "restored">(() => typeof navigator === "undefined" || navigator.onLine ? "online" : "offline");

  useEffect(() => {
    const setOnlineState = () => setState("restored");
    const setOfflineState = () => setState("offline");
    window.addEventListener("online", setOnlineState);
    window.addEventListener("offline", setOfflineState);
    return () => {
      window.removeEventListener("online", setOnlineState);
      window.removeEventListener("offline", setOfflineState);
    };
  }, []);

  return state;
}
