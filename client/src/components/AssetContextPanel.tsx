import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ExternalLink, Link2, MapPin, PackageSearch, RefreshCw } from "lucide-react";

export interface AssetContextSummary {
  id: string;
  code: string;
  name: string;
  assetType: string;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface AssetContextPanelProps {
  incidentReference: string;
  searchAssets: (query: string) => Promise<AssetContextSummary[]>;
  loadAsset?: (assetId: string) => Promise<AssetContextSummary>;
  linkAsset: (assetId: string, incidentReference: string) => Promise<void>;
  inventoryUrl: string;
  onLocateAsset?: (asset: AssetContextSummary) => void;
}

export default function AssetContextPanel({ incidentReference, searchAssets, loadAsset, linkAsset, inventoryUrl, onLocateAsset }: AssetContextPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AssetContextSummary[]>([]);
  const [selected, setSelected] = useState<AssetContextSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState(false);

  const runSearch = async () => {
    const normalized = query.trim();
    if (!normalized) return;
    setLoading(true);
    setSearched(true);
    setError(false);
    try {
      setResults(await searchAssets(normalized));
    } catch {
      setResults([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const selectAsset = async (asset: AssetContextSummary) => {
    setLoading(true);
    setError(false);
    try {
      setSelected(loadAsset ? await loadAsset(asset.id) : asset);
      setLinked(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async () => {
    if (!selected) return;
    setLinking(true);
    setError(false);
    try {
      await linkAsset(selected.id, incidentReference);
      setLinked(true);
    } catch {
      setError(true);
    } finally {
      setLinking(false);
    }
  };

  const canLocate = Boolean(selected && Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude));
  const inventoryBase = inventoryUrl.replace(/\/$/, "");

  return (
    <Card className="border-slate-200 shadow-sm" data-testid="asset-context-panel">
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <PackageSearch className="h-4 w-4 text-sky-700" />
          <h2 className="font-semibold text-slate-950">Ativo relacionado</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">Contexto do Inventário. A ocorrência continua operável mesmo se este serviço estiver indisponível.</p>

        <div className="mt-4 flex gap-2">
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar ativo por código ou nome" onKeyDown={event => { if (event.key === "Enter") void runSearch(); }} />
          <Button type="button" variant="outline" onClick={() => void runSearch()} disabled={loading || !query.trim()}>{loading ? "Buscando..." : "Buscar"}</Button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>Inventário indisponível no momento. O fluxo da ocorrência permanece disponível.</p>
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => void runSearch()}><RefreshCw className="mr-2 h-3.5 w-3.5" />Tentar novamente</Button>
          </div>
        )}

        {!error && !loading && results.length > 0 && !selected && (
          <div className="mt-4 space-y-2">
            {results.map(asset => (
              <button key={asset.id} type="button" aria-label={`Selecionar ${asset.code}`} onClick={() => void selectAsset(asset)} className="w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50">
                <p className="text-sm font-medium text-slate-900">{asset.code} · {asset.name}</p>
                <p className="mt-1 text-xs text-slate-500">{asset.assetType} · {asset.status}</p>
              </button>
            ))}
          </div>
        )}

        {!error && !loading && searched && results.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">Nenhum ativo encontrado para a pesquisa atual.</p>
        )}

        {selected && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{selected.code}</p>
                <p className="text-sm text-slate-700">{selected.name}</p>
                <p className="mt-1 text-xs text-slate-500">{selected.assetType} · {selected.status}</p>
                {linked && <p className="mt-2 text-xs font-medium text-emerald-700">Ocorrência vinculada: {incidentReference}</p>}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setSelected(null); setLinked(false); }}>Trocar ativo</Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void handleLink()} disabled={linking || linked}><Link2 className="mr-2 h-3.5 w-3.5" />{linked ? "Vinculado" : linking ? "Vinculando..." : "Vincular à ocorrência"}</Button>
              <Button type="button" size="sm" variant="outline" disabled={!canLocate} onClick={() => selected && onLocateAsset?.(selected)}><MapPin className="mr-2 h-3.5 w-3.5" />Ver no mapa</Button>
              {inventoryBase && <Button type="button" size="sm" variant="outline" asChild><a href={`${inventoryBase}/assets/${encodeURIComponent(selected.id)}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-3.5 w-3.5" />Abrir prontuário</a></Button>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
