import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRefreshInterval, refreshOptions } from "@/hooks/useRefreshSettings";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

export function didRefreshFail(result: unknown): boolean {
  if (Array.isArray(result)) return result.some(didRefreshFail);
  return Boolean(result && typeof result === "object" && "error" in result && (result as { error?: unknown }).error);
}

export async function executeRefresh(onRefresh: () => Promise<unknown>) {
  try {
    const result = await onRefresh();
    return { succeeded: !didRefreshFail(result) };
  } catch {
    return { succeeded: false };
  }
}

export function RefreshControls({ interval, onIntervalChange, onRefresh, refreshing = false, compact = false, className }: { interval: number; onIntervalChange: (value: number) => void; onRefresh: () => Promise<unknown>; refreshing?: boolean; compact?: boolean; className?: string }) {
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const handleRefresh = async () => {
    setRefreshError(false);
    const result = await executeRefresh(onRefresh);
    if (result.succeeded) {
      setLastUpdated(Date.now());
    } else {
      setRefreshError(true);
    }
  };
  return <div className={cn("flex flex-wrap items-center gap-2", compact ? "" : "rounded-xl border border-slate-200 bg-white p-3 shadow-sm", className)}>
    <Select value={String(interval)} onValueChange={value => onIntervalChange(Number(value))}>
      <SelectTrigger aria-label="Intervalo de atualização automática" className="h-9 w-[190px] bg-white"><SelectValue /></SelectTrigger>
      <SelectContent>{refreshOptions.map(option => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
    <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} aria-label="Atualizar dados agora">
      <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Atualizando" : "Atualizar agora"}
    </Button>
    {interval > 0 && <span className="text-xs text-slate-500">Próxima atualização em até {formatRefreshInterval(interval)}.</span>}
    {lastUpdated && <span className="text-xs text-slate-500">Atualizado agora</span>}
    {refreshError && <span role="alert" className="text-xs text-rose-700">Não foi possível atualizar. Verifique a conexão e tente novamente.</span>}
  </div>;
}
