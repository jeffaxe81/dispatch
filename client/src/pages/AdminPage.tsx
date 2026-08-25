import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { RefreshControls } from "@/components/RefreshControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRefreshSettings } from "@/hooks/useRefreshSettings";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, UserCog } from "lucide-react";
import React, { useEffect, useState } from "react";

const roles = ["operador", "despachador", "agente", "supervisor", "administrador"] as const;
type OperationalRole = typeof roles[number];
const roleLabels: Record<OperationalRole, string> = { operador: "Operador", despachador: "Despachador", agente: "Agente de Campo", supervisor: "Supervisor", administrador: "Administrador" };

type UserItem = { id: number; name: string | null; email: string | null; openId: string; operationalRole: OperationalRole; teamId: number | null; active: boolean };
type TeamItem = { team: { id: number; code: string; name: string } };

function UserAccessRow({ item, teamCode, teamName, teams, saving, onSave }: { item: UserItem; teamCode: string | null; teamName: string | null; teams: TeamItem[]; saving: boolean; onSave: (input: { userId: number; operationalRole: OperationalRole; teamId: number | null; active: boolean }) => void }) {
  const [operationalRole, setOperationalRole] = useState<OperationalRole>(item.operationalRole);
  const [teamId, setTeamId] = useState<number | null>(item.teamId);
  const [active, setActive] = useState(item.active);
  const needsTeam = operationalRole === "agente";
  const hasChanges = operationalRole !== item.operationalRole || teamId !== item.teamId || active !== item.active;

  useEffect(() => { setOperationalRole(item.operationalRole); setTeamId(item.teamId); setActive(item.active); }, [item.active, item.operationalRole, item.teamId]);

  return <tr>
    <td className="px-5 py-4"><div className="font-medium text-slate-950">{item.name ?? "Sem nome"}</div><div className="mt-1 text-xs text-slate-500">{item.email ?? item.openId}</div></td>
    <td className="px-4 py-4"><Select value={operationalRole} onValueChange={value => setOperationalRole(value as OperationalRole)} disabled={saving}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent>{roles.map(role => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}</SelectContent></Select></td>
    <td className="px-4 py-4"><Select value={teamId ? String(teamId) : "none"} onValueChange={value => setTeamId(value === "none" ? null : Number(value))} disabled={saving}><SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem equipe</SelectItem>{teams.map(({ team }) => <SelectItem key={team.id} value={String(team.id)}>{team.code} · {team.name}</SelectItem>)}</SelectContent></Select>{needsTeam && !teamId ? <p className="mt-1 text-[11px] font-medium text-amber-700">Agente de Campo exige equipe vinculada.</p> : teamCode && <p className="mt-1 text-[11px] text-slate-500">Vinculado: {teamCode} · {teamName}</p>}</td>
    <td className="px-4 py-4"><div className="flex items-center gap-2"><Switch checked={active} onCheckedChange={setActive} disabled={saving} aria-label={`Alterar situação de ${item.name ?? item.openId}`} /><Badge className={active ? "border-0 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "border-0 bg-slate-100 text-slate-600 ring-1 ring-slate-200"}>{active ? "Ativo" : "Inativo"}</Badge></div></td>
    <td className="px-4 py-4"><Button type="button" size="sm" disabled={saving || !hasChanges || (needsTeam && !teamId)} onClick={() => onSave({ userId: item.id, operationalRole, teamId, active })}>Salvar vínculo</Button></td>
  </tr>;
}

function AdminContent() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const refresh = useRefreshSettings();
  const access = trpc.access.me.useQuery(undefined, { retry: false });
  const canManageUsers = (access.data?.permissions ?? []).includes("users.edit") && (access.data?.permissions ?? []).includes("users.view");
  const users = trpc.administration.users.useQuery(undefined, { enabled: canManageUsers, refetchInterval: refresh.interval || false });
  const teams = trpc.teams.list.useQuery(undefined, { enabled: canManageUsers });
  const update = trpc.administration.updateUser.useMutation({ onSuccess: () => { utils.administration.users.invalidate(); utils.auth.me.invalidate(); utils.access.me.invalidate(); } });
  if (!access.isLoading && !canManageUsers) return <div className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold text-slate-900">Administração restrita</h1><p className="mt-2 text-sm text-slate-500">Seu perfil não possui as permissões <strong>users.view</strong> e <strong>users.edit</strong> necessárias para configurar vínculos operacionais.</p></div>;

  return <div className="mx-auto max-w-[1400px] space-y-5 pb-8"><header className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-700">Segurança operacional</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">Perfis e acessos</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">Selecione perfil, equipe e situação antes de salvar. Para Agente de Campo, o sistema vincula o perfil dinâmico de agente à equipe selecionada.</p></div><RefreshControls compact interval={refresh.interval} onIntervalChange={refresh.setInterval} onRefresh={() => users.refetch()} refreshing={users.isFetching} /></header><QueryState loading={users.isLoading} error={users.error} label="usuários" /><Card className="border-sky-100 bg-sky-50/60"><CardContent className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><p className="text-sm leading-6 text-sky-900">O vínculo é salvo de uma só vez para evitar que a seleção de equipe reverta o perfil. Agente de Campo precisa de equipe ativa e recebe acesso ao Aplicativo Agente dentro desse escopo.</p></CardContent></Card><Card className="overflow-hidden border-slate-200 shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left"><thead className="bg-slate-50 text-[11px] uppercase tracking-[.1em] text-slate-500"><tr><th className="px-5 py-3 font-medium">Usuário</th><th className="px-4 py-3 font-medium">Perfil</th><th className="px-4 py-3 font-medium">Equipe</th><th className="px-4 py-3 font-medium">Ativo</th><th className="px-4 py-3 font-medium">Ação</th></tr></thead><tbody className="divide-y divide-slate-100">{(users.data ?? []).map(({ user: item, teamCode, teamName }) => <UserAccessRow key={item.id} item={item as UserItem} teamCode={teamCode} teamName={teamName} teams={(teams.data ?? []) as TeamItem[]} saving={update.isPending} onSave={update.mutate} />)}{!users.isLoading && (users.data?.length ?? 0) === 0 && <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-500"><UserCog className="mx-auto mb-3 h-6 w-6 text-slate-300" />Nenhum usuário autenticado encontrado.</td></tr>}</tbody></table></div></CardContent></Card>{update.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{update.error.message}</p>}</div>;
}

export default function AdminPage() { return <DashboardLayout><AdminContent /></DashboardLayout>; }
