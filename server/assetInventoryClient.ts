export interface AssetInventoryIdentity {
  tenantId: string;
  userId: string;
  correlationId: string;
}

export interface AssetInventorySummary {
  id: string;
  code: string;
  name: string;
  assetType: string;
  status: string;
  [key: string]: unknown;
}

export interface AssetInventorySearchResult {
  items: AssetInventorySummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DispatchReferenceInput {
  referenceType: "occurrence" | "order" | "activity";
  referenceId: string;
  idempotencyKey: string;
}

export interface AssetInventoryClientError extends Error {
  code: string;
  retryable: boolean;
  status?: number;
}

export interface AssetInventoryClient {
  search(identity: AssetInventoryIdentity, query?: { query?: string; assetType?: string; status?: string; page?: number; pageSize?: number }): Promise<AssetInventorySearchResult>;
  getById(identity: AssetInventoryIdentity, assetId: string): Promise<AssetInventorySummary>;
  linkDispatchReference(identity: AssetInventoryIdentity, assetId: string, input: DispatchReferenceInput): Promise<Record<string, unknown>>;
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface CreateAssetInventoryClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetcher?: Fetcher;
}

function clientError(code: string, message: string, retryable: boolean, status?: number): AssetInventoryClientError {
  const error = new Error(message) as AssetInventoryClientError;
  error.name = "AssetInventoryClientError";
  error.code = code;
  error.retryable = retryable;
  if (status !== undefined) error.status = status;
  return error;
}

function headers(identity: AssetInventoryIdentity): Headers {
  const result = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    "x-tenant-id": identity.tenantId,
    "x-user-id": identity.userId,
    "x-correlation-id": identity.correlationId,
  });
  return result;
}

export function createAssetInventoryClient(options: CreateAssetInventoryClientOptions): AssetInventoryClient {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 3000;

  async function request<T>(identity: AssetInventoryIdentity, path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await Promise.race([
        fetcher(`${baseUrl}${path}`, { ...init, headers: headers(identity), signal: controller.signal }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(clientError("asset_inventory.unavailable", "Asset Inventory request timed out", true)), timeoutMs)),
      ]);
      if (!response.ok) {
        if (response.status >= 500) throw clientError("asset_inventory.unavailable", "Asset Inventory service unavailable", true, response.status);
        throw clientError("asset_inventory.request_failed", "Asset Inventory request failed", false, response.status);
      }
      return await response.json() as T;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) throw error;
      throw clientError("asset_inventory.unavailable", "Asset Inventory service unavailable", true);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async search(identity, query = {}) {
      const params = new URLSearchParams();
      if (query.query) params.set("query", query.query);
      if (query.assetType) params.set("assetType", query.assetType);
      if (query.status) params.set("status", query.status);
      if (query.page) params.set("page", String(query.page));
      if (query.pageSize) params.set("pageSize", String(query.pageSize));
      const suffix = params.size ? `?${params.toString()}` : "";
      return request<AssetInventorySearchResult>(identity, `/api/v1/assets${suffix}`);
    },
    async getById(identity, assetId) {
      return request<AssetInventorySummary>(identity, `/api/v1/assets/${encodeURIComponent(assetId)}`);
    },
    async linkDispatchReference(identity, assetId, input) {
      return request<Record<string, unknown>>(identity, `/api/v1/assets/${encodeURIComponent(assetId)}/dispatch-references`, {
        method: "POST",
        body: JSON.stringify({ ...input, source: "dispatch" }),
      });
    },
  };
}
