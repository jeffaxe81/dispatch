/** Mobile routes are a view of existing permission-filtered desktop navigation. */
const PRIMARY_PATHS = ["/", "/ocorrencias", "/equipes", "/agente"] as const;
export function selectMobileTabs<T extends { path: string }>(items: readonly T[]): T[] {
  return PRIMARY_PATHS.flatMap(path => {
    const item = items.find(candidate => candidate.path === path);
    return item ? [item] : [];
  });
}
export function isMobileTabActive(current: string, path: string): boolean {
  return current === path || (path !== "/" && current.startsWith(path + "/"));
}
