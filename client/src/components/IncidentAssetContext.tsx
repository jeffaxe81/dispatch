import AssetContextPanel, { type AssetContextSummary } from "@/components/AssetContextPanel";
import LeafletOperationalMap from "@/components/LeafletOperationalMap";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

export interface IncidentAssetContextProps {
  incident: {
    code: string;
    category: string;
    priority: string;
    latitude: string | number;
    longitude: string | number;
  };
}

export default function IncidentAssetContext({ incident }: IncidentAssetContextProps) {
  const config = trpc.assetInventory.config.useQuery(undefined, { retry: false });
  const search = trpc.assetInventory.search.useMutation();
  const detail = trpc.assetInventory.detail.useMutation();
  const link = trpc.assetInventory.linkOccurrence.useMutation();
  const [locatedAsset, setLocatedAsset] = useState<AssetContextSummary | null>(null);

  const searchAssets = async (query: string) => {
    const result = await search.mutateAsync({ query });
    return result.items as AssetContextSummary[];
  };
  const loadAsset = async (assetId: string) => detail.mutateAsync({ assetId }) as Promise<AssetContextSummary>;
  const linkAsset = async (assetId: string, incidentReference: string) => {
    await link.mutateAsync({ assetId, incidentReference });
  };

  return (
    <>
      <AssetContextPanel
        incidentReference={incident.code}
        searchAssets={searchAssets}
        loadAsset={loadAsset}
        linkAsset={linkAsset}
        inventoryUrl={config.data?.webUrl ?? ""}
        onLocateAsset={setLocatedAsset}
      />
      <Dialog open={Boolean(locatedAsset)} onOpenChange={open => { if (!open) setLocatedAsset(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Ativo no contexto da ocorrência</DialogTitle>
            <DialogDescription>Visualização contextual; o Inventário permanece responsável pelo prontuário completo do ativo.</DialogDescription>
          </DialogHeader>
          {locatedAsset && Number.isFinite(locatedAsset.latitude) && Number.isFinite(locatedAsset.longitude) && (
            <LeafletOperationalMap
              center={{ lat: Number(locatedAsset.latitude), lng: Number(locatedAsset.longitude) }}
              zoom={16}
              incidents={[{
                code: incident.code,
                category: incident.category,
                priority: incident.priority,
                latitude: incident.latitude,
                longitude: incident.longitude,
              }]}
              teams={[]}
              assets={[{
                id: locatedAsset.id,
                code: locatedAsset.code,
                name: locatedAsset.name,
                status: locatedAsset.status,
                latitude: Number(locatedAsset.latitude),
                longitude: Number(locatedAsset.longitude),
              }]}
              className="h-[480px] w-full overflow-hidden rounded-xl"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
