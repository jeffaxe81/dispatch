import React, { useMemo, useState } from "react";
import type { WorkspaceScreen } from "@shared/workspaceLayout";
import type { MultiMonitorOpenResult } from "./MultiMonitorManager";

export type OpenOperationLayoutButtonProps = {
  screens: readonly WorkspaceScreen[];
  openAllExternal(screens: readonly WorkspaceScreen[]): MultiMonitorOpenResult[];
};

type OpenSummary = {
  opened: number;
  focused: number;
  blocked: number;
};

function summarize(results: readonly MultiMonitorOpenResult[]): OpenSummary {
  return results.reduce<OpenSummary>((summary, result) => {
    if (result.status === "opened") summary.opened += 1;
    if (result.status === "focused") summary.focused += 1;
    if (result.status === "blocked") summary.blocked += 1;
    return summary;
  }, { opened: 0, focused: 0, blocked: 0 });
}

export function OpenOperationLayoutButton({ screens, openAllExternal }: OpenOperationLayoutButtonProps) {
  const externalCount = useMemo(() => screens.filter(screen => screen.mode === "external").length, [screens]);
  const [summary, setSummary] = useState<OpenSummary | null>(null);

  const openOperationLayout = () => {
    const results = openAllExternal(screens);
    setSummary(summarize(results));
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={openOperationLayout}
        disabled={externalCount === 0}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Abrir configuração de operação
      </button>

      {summary && summary.blocked === 0 ? (
        <p role="status" className="text-sm text-slate-600">
          {summary.opened} aberta(s), {summary.focused} focada(s).
        </p>
      ) : null}

      {summary && summary.blocked > 0 ? (
        <p role="alert" className="text-sm font-medium text-amber-700">
          {summary.blocked} bloqueada(s) pelo navegador. Permita pop-up para abrir as superfícies restantes.
        </p>
      ) : null}
    </div>
  );
}

export default OpenOperationLayoutButton;
