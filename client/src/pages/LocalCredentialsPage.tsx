import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";

function LocalCredentialsContent() {
  const users = trpc.access.users.useQuery({ page: 1, pageSize: 100 });
  const setCredentials = trpc.access.setLocalCredentials.useMutation();
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const selected = users.data?.rows.find(row => String(row.user.id) === userId);

  return <div className="mx-auto max-w-2xl space-y-6 pb-10">
    <header><p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-700">Administração</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">Credenciais locais</h1><p className="mt-2 text-sm leading-6 text-slate-600">Defina ou redefina o acesso por usuário e senha de uma pessoa já provisionada. Senhas nunca são exibidas ou armazenadas em texto.</p></header>
    <Card className="border-teal-100"><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-5 text-teal-700" />Acesso do usuário</CardTitle><CardDescription>O novo acesso substitui a senha anterior e zera bloqueios de tentativa.</CardDescription></CardHeader><CardContent><form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!userId) return; setCredentials.mutate({ userId: Number(userId), username, password }); }}>
      <div className="grid gap-2"><Label>Usuário operacional</Label><Select value={userId} onValueChange={value => { setUserId(value); const user = users.data?.rows.find(row => String(row.user.id) === value); setUsername(user?.user.username ?? ""); }}><SelectTrigger><SelectValue placeholder={users.isLoading ? "Carregando usuários…" : "Selecione uma pessoa"} /></SelectTrigger><SelectContent>{(users.data?.rows ?? []).map(row => <SelectItem key={row.user.id} value={String(row.user.id)}>{row.profile?.displayName ?? row.user.name ?? row.user.email ?? `Usuário ${row.user.id}`}</SelectItem>)}</SelectContent></Select></div>
      {selected && <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700"><ShieldCheck className="mr-2 inline size-4 text-teal-700" />Perfil operacional: <strong>{selected.user.operationalRole}</strong></div>}
      <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="local-username">Usuário de login</Label><Input id="local-username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="ex.: maria.silva" required /></div><div className="grid gap-2"><Label htmlFor="local-password">Nova senha</Label><Input id="local-password" type="password" autoComplete="new-password" minLength={12} value={password} onChange={event => setPassword(event.target.value)} required /><p className="text-xs text-slate-500">Mínimo de 12 caracteres.</p></div></div>
      {setCredentials.error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{setCredentials.error.message}</p>}
      {setCredentials.isSuccess && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Credenciais locais atualizadas com segurança.</p>}
      <Button disabled={!userId || setCredentials.isPending}>{setCredentials.isPending ? "Salvando…" : "Salvar credenciais"}</Button>
    </form></CardContent></Card>
  </div>;
}

export default function LocalCredentialsPage() { return <DashboardLayout><LocalCredentialsContent /></DashboardLayout>; }
