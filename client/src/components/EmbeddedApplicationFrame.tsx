import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildEmbeddedApplicationAllow,
  parseEmbeddedFrameMessage,
  type EmbeddedApplication,
  type EmbeddedFrameMessage,
} from "@shared/embeddedApplications";
import { Button } from "@/components/ui/button";

export type EmbeddedFrameSecurityEvent =
  | { type: "origin_rejected"; origin: string }
  | { type: "source_rejected"; origin: string }
  | { type: "payload_rejected"; origin: string };

export type EmbeddedFrameDimensions = {
  width: string;
  height: number;
};

export function resolveEmbeddedFrameDimensions(
  application: EmbeddedApplication,
  message: EmbeddedFrameMessage,
  containerWidth: number,
): EmbeddedFrameDimensions {
  if (!message.isExpanded) {
    return { width: "100%", height: application.defaultHeight };
  }

  const safeContainerWidth = Number.isFinite(containerWidth) && containerWidth > 0
    ? containerWidth
    : application.maxWidth ?? 1600;
  const configuredMaxWidth = application.maxWidth ?? safeContainerWidth;
  const requestedWidth = message.width ?? safeContainerWidth;
  const width = Math.max(1, Math.min(requestedWidth, configuredMaxWidth, safeContainerWidth));

  const requestedHeight = message.height ?? application.defaultHeight;
  const height = Math.max(
    application.minHeight,
    Math.min(requestedHeight, application.maxHeight),
  );

  return { width: `${Math.round(width)}px`, height: Math.round(height) };
}

export function EmbeddedApplicationFrame({
  application,
  timeoutMs = 20_000,
  onSecurityEvent,
}: {
  application: EmbeddedApplication;
  timeoutMs?: number;
  onSecurityEvent?: (event: EmbeddedFrameSecurityEvent) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "timeout" | "error">("loading");
  const [dimensions, setDimensions] = useState<EmbeddedFrameDimensions>({
    width: "100%",
    height: application.defaultHeight,
  });
  const allow = useMemo(
    () => buildEmbeddedApplicationAllow(application.permissions),
    [application.permissions],
  );

  useEffect(() => {
    setStatus("loading");
    setDimensions({ width: "100%", height: application.defaultHeight });
  }, [application.defaultHeight, application.id, reloadKey]);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setTimeout(() => setStatus("timeout"), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [reloadKey, status, timeoutMs]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== application.origin) {
        onSecurityEvent?.({ type: "origin_rejected", origin: event.origin });
        return;
      }

      const iframeWindow = iframeRef.current?.contentWindow;
      if (iframeWindow && event.source !== iframeWindow) {
        onSecurityEvent?.({ type: "source_rejected", origin: event.origin });
        return;
      }

      const parsed = parseEmbeddedFrameMessage(event.data);
      if (!parsed.success) {
        onSecurityEvent?.({ type: "payload_rejected", origin: event.origin });
        return;
      }

      const containerWidth = containerRef.current?.clientWidth
        ?? document.documentElement.clientWidth
        ?? window.innerWidth;

      setDimensions(
        resolveEmbeddedFrameDimensions(application, parsed.data, containerWidth),
      );
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [application, onSecurityEvent]);

  const sendInit = () => {
    setStatus("ready");
    iframeRef.current?.contentWindow?.postMessage(
      { type: "init", timestamp: Date.now() },
      application.origin,
    );
  };

  const retry = () => {
    setReloadKey(value => value + 1);
  };

  if (!application.enabled) {
    return (
      <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        A aplicação incorporada está desabilitada.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full min-w-0">
      <div className="mb-3 flex min-h-10 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          {status === "loading" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" />}
          {(status === "timeout" || status === "error") && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
          <span className="truncate text-slate-600">
            {status === "loading" && `Carregando ${application.name}...`}
            {status === "ready" && `${application.name} conectado ao container.`}
            {status === "timeout" && `${application.name} ainda não confirmou o carregamento.`}
            {status === "error" && `Não foi possível carregar ${application.name}.`}
          </span>
        </div>
        {(status === "timeout" || status === "error") && (
          <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={retry}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        )}
      </div>

      <div className="flex w-full min-w-0 justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <iframe
          key={reloadKey}
          ref={iframeRef}
          id={`embedded-app-${application.id}`}
          title={application.name}
          src={application.src}
          width="100%"
          height={dimensions.height}
          frameBorder="0"
          allow={allow}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="block max-w-full bg-white"
          style={{
            width: dimensions.width,
            height: `${dimensions.height}px`,
            maxWidth: "100%",
          }}
          onLoad={sendInit}
          onError={() => setStatus("error")}
        />
      </div>
    </div>
  );
}

export default EmbeddedApplicationFrame;
