import React, { createContext, useContext, useMemo, useState } from "react";

export type WorkspaceSurfaceSelection = {
  incidentId?: number;
};

type WorkspaceSurfaceContextValue = {
  selection: WorkspaceSurfaceSelection;
  selectIncident(id: number | undefined): void;
};

const WorkspaceSurfaceContext = createContext<WorkspaceSurfaceContextValue | null>(null);

export function WorkspaceSurfaceProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<WorkspaceSurfaceSelection>({});
  const value = useMemo<WorkspaceSurfaceContextValue>(() => ({
    selection,
    selectIncident(id) {
      setSelection(id === undefined ? {} : { incidentId: id });
    },
  }), [selection]);

  return <WorkspaceSurfaceContext.Provider value={value}>{children}</WorkspaceSurfaceContext.Provider>;
}

export function useWorkspaceSurfaceContext(): WorkspaceSurfaceContextValue {
  const value = useContext(WorkspaceSurfaceContext);
  if (!value) throw new Error("WorkspaceSurfaceProvider é obrigatório para consumir o contexto da superfície.");
  return value;
}
