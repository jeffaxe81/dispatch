import {useEffect, useState} from "react";
/** Browser connectivity is a UI guard, not proof that the API is reachable or authorized. */
export function readNetworkConnectivity() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
export function useNetworkConnectivity() {
  const [online, setOnline] = useState(readNetworkConnectivity);
  useEffect(() => {
    const update = () => setOnline(readNetworkConnectivity());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
