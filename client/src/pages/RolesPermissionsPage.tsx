import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { getAccessGuidance } from "@/lib/accessGuidance";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, BookOpenCheck, CopyPlus, LockKeyhole, Plus, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

const scopes = ["global", "organizacao", "unidade", "departamento", "grupo", "equipe"] as const;
const scopeLabels: Record<(typeof scopes)[number], string> = { global: "Global", organizacao: "Organização", unidade: "Unidade", departamento: "Departamento", grupo: "Grupo", equipe: "Equipe" };
const emptyRole = { code: "", name: "", description: "", defaultScope: "organizacao" as (typeof scopes)[number], permissionIds: [] as number[] };
const emptyPermission = { code: "", resource: "", action: "", description: "" };

function AccessGuidance({ message }: { message?: string }) {
  const guidance = getAccessGuidance(message);
  if (!guidance) return null;
  return <Card className="border-amber-200 bg-amber-50/50"><CardContent className="flex gap-3 p-4"><BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><h3 className="font-semibold text-amber-950">{guidance.title}</h3><p className="mt-1 text-sm leading-6 text-amber-900">{guidance.explanation}</p><ol className="mt-3 list-decimal space-y-1 pl-4 text-sm leading-5 text-amber-950">{guidance.steps.map(step => <li key={step}>{step}</li>)}</ol></div></CardContent></Card>;
}

function RolesPermissionsContent() {
  const roles = trpc.access.roles.useQuery();
  const permissions = trpc.access.permissions.useQuery();
  const utils = trpc.useUtils();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState(emptyRole);
  const [permissionDraft, setPermissionDraft] = useState(emptyPermission);
  const current = (roles.data ?? []).find(row => row.role.id === selectedRoleId) ?? roles.data?.[0];
  const groupedPermissions = useMemo(() => (permissions.data ?? []).reduce<Record<string, typeof permissions.data>>((groups, permission) => ({ ...groups, [permission.resource]: [...(groups[permission.resource] ?? []), permission] }), {}), [permissions.data]);
  const createRole = trpc.access.createRole.useMutation({ onSuccess: () => { utils.access.roles.invalidate(); setRoleDialogOpen(false); setRoleDraft(emptyRole); } });
  const createPermission = trpc.access.createPermission.useMutation({ onSuccess: () => { utils.access.permissions.invalidate(); setPermissionDialogOpen(false); setPermissionDraft(emptyPermission); } });
  const update = trpc.access.updateRole.useMutation({ onSuccess: () => utils.access.roles.invalidate() });
  const selectedPermissionIds = new Set(current?.permissionIds ?? roleDraft.permissionIds);
  const errorMessage = createRole.error?.message ?? createPermission.error?.message ?? update.error?.message;

  const openRoleCreate = (copy = false) => {
    const source = copy ? current : undefined;
    setRoleDraft({ code: source ? `${source.role.code}_local` : "", name: source ? `${source.role.name} (local)` : "", description: source?.role.description ?? "", defaultScope: source?.role.defaultScope ?? "organizacao", permissionIds: source?.permissionIds ?? [] });
    setRoleDialogOpen(true);
  };

  const togglePermission = (permissionId: number, checked: boolean) => {
    const next = new Set(roleDraft.permissionIds);
    checked ? next.add(permissionId) : next.delete(permissionId);
    setRoleDraft(currentDraft => ({ ...currentDraft, permissionIds: Array.from(next) }));
  };

  const updatePermissionPart = (field: "resource" | "action", value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    setPermissionDraft(currentDraft => {
      const next = { ...currentDraft, [field]: sanitized };
      return { ...next, code: next.resource && next.action ? `${next.resource}.${next.action}` : next.code };
    });
  };

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-8">
    <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-700">Administração</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">Perfis e acessos</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">Crie perfis e permissões locais de forma auditável. A aplicação valida regras no servidor e explica como corrigir configurações inválidas.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setPermissionDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Permissão local</Button><Button onClick={() => openRoleCreate()}><Plus className="mr-2 h-4 w-4" />Criar perfil</Button></div></header>
    <AccessGuidance message={errorMessage} />
    <Card className="border-sky-100 bg-sky-50/60"><CardContent className="flex gap-3 p-4"><BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><p className="text-sm leading-6 text-sky-900"><strong>Roteiro rápido:</strong> primeiro crie uma permissão local no padrão <code>recurso.acao</code>, depois inclua-a em um perfil local e, por fim, vincule o perfil ao usuário com o escopo requerido.</p></CardContent></Card>
    <QueryState loading={roles.isLoading || permissions.isLoading} error={roles.error ?? permissions.error} label="perfis e permissões" />
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><Card className="border-slate-200 shadow-sm"><CardContent className="p-3"><div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[.13em] text-slate-500">Perfis cadastrados</div><div className="space-y-1">{(roles.data ?? []).map(row => <button key={row.role.id} onClick={() => setSelectedRoleId(row.role.id)} className={`w-full rounded-xl px-3 py-3 text-left transition-colors ${current?.role.id === row.role.id ? "bg-sky-50 text-sky-950 ring-1 ring-sky-200" : "hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-3"><span className="font-medium">{row.role.name}</span>{row.role.isSystem ? <LockKeyhole className="h-3.5 w-3.5 text-slate-500" /> : <Badge variant="outline" className="border-sky-200 text-[10px] text-sky-800">Local</Badge>}</div><div className="mt-1 flex items-center justify-between text-xs text-slate-500"><span>{scopeLabels[row.role.defaultScope]}</span><span>{row.assignedUsers} usuário(s)</span></div></button>)}{!roles.isLoading && !roles.data?.length && <p className="p-5 text-sm text-slate-500">Não há perfis disponíveis.</p>}</div></CardContent></Card>
      {current && <div className="space-y-4"><Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold text-slate-950">{current.role.name}</h2>{current.role.isSystem ? <Badge variant="outline">Padrão protegido</Badge> : <Badge className="border-0 bg-sky-50 text-sky-800">Item local</Badge>}{!current.role.active && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Inativo</Badge>}</div><p className="mt-2 text-sm text-slate-600">{current.role.description ?? "Sem descrição."}</p><p className="mt-2 text-xs font-medium uppercase tracking-[.12em] text-slate-500">Escopo padrão: {scopeLabels[current.role.defaultScope]}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => openRoleCreate(true)}><CopyPlus className="mr-2 h-4 w-4" />Duplicar</Button>{!current.role.isSystem && <Button variant="outline" onClick={() => update.mutate({ roleId: current.role.id, active: !current.role.active })}>{current.role.active ? "Desativar" : "Ativar"}</Button>}</div></div></CardContent></Card>
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-sky-700" /><div><h3 className="font-semibold text-slate-950">Matriz de permissões</h3><p className="text-sm text-slate-500">{current.permissionIds.length} permissão(ões) concedida(s).</p></div></div><div className="grid gap-4 md:grid-cols-2">{Object.entries(groupedPermissions).map(([resource, resourcePermissions = []]) => <section key={resource} className="rounded-xl border border-slate-200 p-4"><h4 className="mb-3 text-xs font-semibold uppercase tracking-[.13em] text-slate-500">{resource}</h4><div className="space-y-3">{resourcePermissions.map(permission => <label key={permission.id} className="flex cursor-pointer items-start gap-3 text-sm"><Checkbox checked={selectedPermissionIds.has(permission.id)} onCheckedChange={checked => { if (current.role.isSystem) return; const ids = new Set(current.permissionIds); checked ? ids.add(permission.id) : ids.delete(permission.id); update.mutate({ roleId: current.role.id, permissionIds: Array.from(ids) }); }} disabled={current.role.isSystem || update.isPending} /><span><strong className="font-medium text-slate-800">{permission.code}</strong><small className="mt-0.5 block text-slate-500">{permission.description}</small></span></label>)}</div></section>)}</div></CardContent></Card></div>}</div>
    <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}><DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto"><DialogHeader><DialogTitle>Criar perfil local</DialogTitle><DialogDescription>Perfis personalizados começam sem usuários vinculados e podem ser aplicados com escopo posteriormente.</DialogDescription></DialogHeader><form className="grid gap-4 py-2" onSubmit={event => { event.preventDefault(); createRole.mutate(roleDraft); }}><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="role-code">Código</Label><Input id="role-code" value={roleDraft.code} onChange={event => setRoleDraft(value => ({ ...value, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))} placeholder="coordenador_local" required /></div><div className="grid gap-2"><Label htmlFor="role-name">Nome</Label><Input id="role-name" value={roleDraft.name} onChange={event => setRoleDraft(value => ({ ...value, name: event.target.value }))} placeholder="Coordenador local" required /></div></div><div className="grid gap-2"><Label>Escopo padrão</Label><Select value={roleDraft.defaultScope} onValueChange={value => setRoleDraft(currentDraft => ({ ...currentDraft, defaultScope: value as (typeof scopes)[number] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{scopes.map(scope => <SelectItem key={scope} value={scope}>{scopeLabels[scope]}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="role-description">Descrição</Label><Textarea id="role-description" value={roleDraft.description} onChange={event => setRoleDraft(value => ({ ...value, description: event.target.value }))} placeholder="Finalidade e limites do perfil" /></div><div className="grid gap-2"><Label>Permissões iniciais</Label><div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-2">{(permissions.data ?? []).map(permission => <label key={permission.id} className="flex items-center gap-2 text-sm"><Checkbox checked={roleDraft.permissionIds.includes(permission.id)} onCheckedChange={checked => togglePermission(permission.id, Boolean(checked))} /><span>{permission.code}</span></label>)}</div></div>{createRole.error && <p role="alert" className="text-sm text-rose-700">{createRole.error.message}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRoleDialogOpen(false)}>Cancelar</Button><Button disabled={createRole.isPending}>{createRole.isPending ? "Criando..." : "Criar perfil local"}</Button></div></form></DialogContent></Dialog>
    <Dialog open={permissionDialogOpen} onOpenChange={setPermissionDialogOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Criar permissão local</DialogTitle><DialogDescription>Uma permissão descreve uma ação única. O código deve seguir o padrão recurso.ação e corresponder aos campos abaixo.</DialogDescription></DialogHeader><form className="grid gap-4 py-2" onSubmit={event => { event.preventDefault(); createPermission.mutate({ ...permissionDraft, description: permissionDraft.description.trim() || undefined }); }}><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="permission-resource">Recurso</Label><Input id="permission-resource" value={permissionDraft.resource} onChange={event => updatePermissionPart("resource", event.target.value)} placeholder="relatorios" required /></div><div className="grid gap-2"><Label htmlFor="permission-action">Ação</Label><Input id="permission-action" value={permissionDraft.action} onChange={event => updatePermissionPart("action", event.target.value)} placeholder="aprovar" required /></div></div><div className="grid gap-2"><Label htmlFor="permission-code">Código da permissão</Label><Input id="permission-code" value={permissionDraft.code} onChange={event => setPermissionDraft(value => ({ ...value, code: event.target.value.toLowerCase() }))} placeholder="relatorios.aprovar" required /><p className="text-xs text-slate-500">Use letras minúsculas, números e sublinhado. O código deve ser igual a <strong>{permissionDraft.resource || "recurso"}.{permissionDraft.action || "acao"}</strong>.</p></div><div className="grid gap-2"><Label htmlFor="permission-description">Descrição</Label><Textarea id="permission-description" value={permissionDraft.description} onChange={event => setPermissionDraft(value => ({ ...value, description: event.target.value }))} placeholder="Permite aprovar relatórios consolidados" /></div>{createPermission.error && <p role="alert" className="text-sm text-rose-700">{createPermission.error.message}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPermissionDialogOpen(false)}>Cancelar</Button><Button disabled={createPermission.isPending}>{createPermission.isPending ? "Criando..." : "Criar permissão local"}</Button></div></form></DialogContent></Dialog>
  </div>;
}

export default function RolesPermissionsPage() { return <DashboardLayout><RolesPermissionsContent /></DashboardLayout>; }
