import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";

const ACTIVE_ORGANIZATION_STORAGE_KEY = "dispatch.activeOrganizationId";

export function TenantBoundaryShell({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const selection = trpc.tenant.selection.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
    staleTime: 30_000,
  });
  const data = selection.data;
  const utils = trpc.useUtils();
  const bootstrapState = trpc.access.bootstrapState.useQuery(undefined, {
    enabled: Boolean(user) && data?.organizations.length === 0,
    retry: false,
    staleTime: 30_000,
  });
  const [organization, setOrganization] = useState({ code: "", name: "" });
  const initializeOrganization = trpc.access.initializeOrganization.useMutation({
    onSuccess: async created => {
      window.localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, String(created.id));
      await Promise.all([
        utils.tenant.selection.invalidate(),
        utils.access.bootstrapState.invalidate(),
      ]);
      window.location.reload();
    },
  });

  useEffect(() => {
    if (!data?.activeOrganizationId) return;
    const current = window.localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
    if (current !== String(data.activeOrganizationId)) {
      window.localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, String(data.activeOrganizationId));
    }
  }, [data?.activeOrganizationId]);

  const selectTenant = (organizationId: number) => {
    window.localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, String(organizationId));
    window.location.reload();
  };

  if (authLoading || !user) return <>{children}</>;

  if (selection.isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
          <Building2 className="h-5 w-5 text-sky-700" aria-hidden="true" />
          Validando empresa ativa…
        </div>
      </div>
    );
  }

  if (selection.isError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-lg">
          <h1 className="text-lg font-semibold text-slate-950">Não foi possível validar a empresa ativa</h1>
          <p className="mt-2 text-sm text-slate-600">{selection.error.message}</p>
          <button type="button" className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={() => selection.refetch()}>Tentar novamente</button>
        </div>
      </div>
    );
  }

  if (data && data.organizations.length === 0) {
    if (bootstrapState.isLoading) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
            <Building2 className="h-5 w-5 text-sky-700" aria-hidden="true" />
            Verificando configuração inicial…
          </div>
        </div>
      );
    }

    if (bootstrapState.isError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-lg">
            <h1 className="text-lg font-semibold text-slate-950">Não foi possível validar a configuração inicial</h1>
            <p className="mt-2 text-sm text-slate-600">{bootstrapState.error.message}</p>
            <button type="button" className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={() => bootstrapState.refetch()}>Tentar novamente</button>
          </div>
        </div>
      );
    }

    if (bootstrapState.data?.canInitialize) {
      const normalizedCode = organization.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const organizationName = organization.name.trim();
      const canSubmit = normalizedCode.length >= 2 && organizationName.length >= 3 && !initializeOrganization.isPending;

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-2xl border border-sky-200 bg-white p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Building2 className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-700">Configuração inicial</p>
                <h1 className="mt-1 text-xl font-semibold text-slate-950">Cadastre a primeira empresa</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">Nenhuma organização existe no AXE Dispatch. Como administrador autorizado, cadastre a empresa inicial para liberar o escopo operacional.</p>
              </div>
            </div>

            <form
              className="mt-6 grid gap-4"
              onSubmit={event => {
                event.preventDefault();
                if (!canSubmit) return;
                initializeOrganization.mutate({ code: normalizedCode, name: organizationName });
              }}
            >
              <div className="grid gap-2">
                <label htmlFor="initial-organization-code" className="text-sm font-medium text-slate-700">Código</label>
                <input
                  id="initial-organization-code"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  value={organization.code}
                  onChange={event => setOrganization(current => ({ ...current, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                  placeholder="axesistemas"
                  autoComplete="off"
                  required
                />
                <p className="text-xs text-slate-500">Identificador técnico único, usando letras minúsculas, números e sublinhado.</p>
              </div>
              <div className="grid gap-2">
                <label htmlFor="initial-organization-name" className="text-sm font-medium text-slate-700">Nome da empresa</label>
                <input
                  id="initial-organization-name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  value={organization.name}
                  onChange={event => setOrganization(current => ({ ...current, name: event.target.value }))}
                  placeholder="Axesistemas"
                  autoComplete="organization"
                  required
                />
              </div>

              {initializeOrganization.error ? (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  {initializeOrganization.error.message}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {initializeOrganization.isPending ? "Criando empresa..." : "Criar empresa e continuar"}
              </button>
              <p className="text-xs leading-5 text-slate-500">Após o primeiro cadastro, novas empresas e unidades continuam sendo gerenciadas em Administração → Escopos organizacionais.</p>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Building2 className="h-5 w-5" /></div>
            <div>
              <h1 className="text-lg font-semibold text-slate-950">Nenhuma empresa autorizada</h1>
              <p className="text-sm text-slate-600">Seu usuário está autenticado, mas não possui empresa liberada para o escopo operacional do AXE Dispatch.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (data?.requiresSelection && data.organizations.length > 1) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Building2 className="h-5 w-5" /></div>
            <div>
              <h1 className="text-lg font-semibold text-slate-950">Selecione a empresa ativa</h1>
              <p className="text-sm text-slate-500">Os dados do AXE Dispatch serão isolados pela empresa selecionada.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            {data.organizations.map(organization => (
              <button
                key={organization.id}
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-sky-300 hover:bg-sky-50 transition-colors"
                onClick={() => selectTenant(organization.id)}
              >
                <span className="block font-medium text-slate-900">{organization.name}</span>
                <span className="block text-xs text-slate-500">{organization.code}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      {data && data.organizations.length > 1 && data.activeOrganizationId ? (
        <div className="fixed right-4 top-16 z-[60] flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-md backdrop-blur">
          <Building2 className="h-4 w-4 text-sky-700" aria-hidden="true" />
          <label htmlFor="active-organization" className="text-xs font-medium text-slate-600">Empresa ativa</label>
          <select
            id="active-organization"
            className="max-w-56 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
            value={data.activeOrganizationId}
            onChange={event => selectTenant(Number(event.target.value))}
          >
            {data.organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
        </div>
      ) : null}
    </>
  );
}
