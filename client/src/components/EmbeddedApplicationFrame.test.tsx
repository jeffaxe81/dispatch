// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NEO_INTERACT_EMBEDDED_APPLICATION } from "@shared/embeddedApplications";
import {
  EmbeddedApplicationFrame,
  resolveEmbeddedFrameDimensions,
} from "./EmbeddedApplicationFrame";

describe("EmbeddedApplicationFrame", () => {
  it("restaura 100% e altura padrão quando a aplicação reduz o iframe", () => {
    expect(resolveEmbeddedFrameDimensions(
      NEO_INTERACT_EMBEDDED_APPLICATION,
      { type: "TOGGLE_IFRAME_SIZE", isExpanded: false, width: 1400, height: 1200 },
      900,
    )).toEqual({ width: "100%", height: 800 });
  });

  it("limita expansão à largura do container e aos limites de altura", () => {
    expect(resolveEmbeddedFrameDimensions(
      NEO_INTERACT_EMBEDDED_APPLICATION,
      { type: "TOGGLE_IFRAME_SIZE", isExpanded: true, width: 1400, height: 5000 },
      390,
    )).toEqual({ width: "390px", height: 1600 });

    expect(resolveEmbeddedFrameDimensions(
      NEO_INTERACT_EMBEDDED_APPLICATION,
      { type: "TOGGLE_IFRAME_SIZE", isExpanded: true, width: 300, height: 100 },
      1200,
    )).toEqual({ width: "300px", height: 320 });
  });

  it("renderiza somente o destino e permissões previamente autorizados", () => {
    const { unmount } = render(
      <EmbeddedApplicationFrame application={NEO_INTERACT_EMBEDDED_APPLICATION} />,
    );
    const iframe = screen.getByTitle("NEO Interact") as HTMLIFrameElement;

    expect(iframe.getAttribute("src")).toBe("https://gscprj.saas.digitro.cloud/neo/");
    expect(iframe.getAttribute("allow")).toBe("camera; microphone; clipboard-write");
    expect(iframe.style.width).toBe("100%");
    expect(iframe.style.height).toBe("800px");
    unmount();
  });

  it("ignora origin inválido e processa mensagem válida da janela do iframe", () => {
    const securityEvent = vi.fn();
    const { unmount } = render(
      <EmbeddedApplicationFrame
        application={NEO_INTERACT_EMBEDDED_APPLICATION}
        onSecurityEvent={securityEvent}
      />,
    );
    const iframe = screen.getByTitle("NEO Interact") as HTMLIFrameElement;

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: "https://example.invalid",
        source: iframe.contentWindow,
        data: {
          type: "TOGGLE_IFRAME_SIZE",
          isExpanded: true,
          width: 600,
          height: 900,
        },
      }));
    });

    expect(iframe.style.width).toBe("100%");
    expect(securityEvent).toHaveBeenCalledWith({
      type: "origin_rejected",
      origin: "https://example.invalid",
    });

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: "https://gscprj.saas.digitro.cloud",
        source: iframe.contentWindow,
        data: {
          type: "TOGGLE_IFRAME_SIZE",
          isExpanded: true,
          width: 600,
          height: 900,
        },
      }));
    });

    expect(iframe.style.width).toBe("600px");
    expect(iframe.style.height).toBe("900px");
    unmount();
  });
});
