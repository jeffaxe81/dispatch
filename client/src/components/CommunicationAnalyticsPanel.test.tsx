// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunicationAnalyticsPanel } from "./CommunicationAnalyticsPanel";

afterEach(() => cleanup());

const metrics = {
  totalSessions: 8,
  completedSessions: 5,
  failedSessions: 1,
  activeSessions: 2,
  totalDurationSeconds: 780,
  averageDurationSeconds: 156,
  byChannel: { nao_informado: 1, voz: 4, chat: 2, whatsapp: 1, email: 0, video: 0, outro: 0 },
};

describe("CommunicationAnalyticsPanel", () => {
  it("shows consolidated communication metrics and channel distribution", () => {
    render(<CommunicationAnalyticsPanel metrics={metrics} channel="all" status="all" onChannelChange={() => undefined} onStatusChange={() => undefined} />);

    expect(screen.getByText("Indicadores de comunicação")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("13m 0s")).toBeTruthy();
    expect(screen.getByText(/voz/i)).toBeTruthy();
  });

  it("allows filtering by channel and technical status", () => {
    const onChannelChange = vi.fn();
    const onStatusChange = vi.fn();
    render(<CommunicationAnalyticsPanel metrics={metrics} channel="all" status="all" onChannelChange={onChannelChange} onStatusChange={onStatusChange} />);

    fireEvent.change(screen.getByLabelText("Canal da comunicação"), { target: { value: "voz" } });
    fireEvent.change(screen.getByLabelText("Status da comunicação"), { target: { value: "falhou" } });

    expect(onChannelChange).toHaveBeenCalledWith("voz");
    expect(onStatusChange).toHaveBeenCalledWith("falhou");
  });
});
