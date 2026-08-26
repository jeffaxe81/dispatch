import { trpc } from "@/lib/trpc";
import { Loader2, LockKeyhole, RadioTower } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const auth = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const login = trpc.auth.login.useMutation({ onSuccess: () => navigate("/") });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (auth.data) navigate("/");
  }, [auth.data, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await login.mutateAsync({ username, password });
  }

  return <main className="min-h-screen bg-slate-950 px-5 py-10 text-white flex items-center justify-center">
    <section className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/40">
      <div className="bg-gradient-to-br from-cyan-950 via-teal-800 to-emerald-700 p-9">
        <div className="mb-7 flex size-12 items-center justify-center rounded-2xl bg-white/15"><RadioTower className="size-6" /></div>
        <p className="text-xs font-bold tracking-[0.22em] text-cyan-100">AXE SISTEMAS</p>
        <h1 className="mt-2 text-3xl font-semibold">AXE Dispatch</h1>
        <p className="mt-3 text-sm leading-6 text-cyan-50/85">Acesso operacional protegido por credenciais locais.</p>
      </div>
      <form className="space-y-5 p-8" onSubmit={submit}>
        <label className="grid gap-2 text-sm font-medium">Usuário<input className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-slate-950 outline-none ring-teal-500 transition focus:ring-2" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label>
        <label className="grid gap-2 text-sm font-medium">Senha<input className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-slate-950 outline-none ring-teal-500 transition focus:ring-2" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
        {login.error && <p className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-100">{login.error.message}</p>}
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-500 font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60" disabled={login.isPending || auth.isLoading} type="submit">{login.isPending ? <Loader2 className="size-5 animate-spin" /> : <LockKeyhole className="size-5" />}{login.isPending ? "Verificando acesso" : "Entrar"}</button>
      </form>
    </section>
  </main>;
}
