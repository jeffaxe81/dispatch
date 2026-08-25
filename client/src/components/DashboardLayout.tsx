import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { isFieldAgent, type AccessAssignmentLike } from "@/lib/operationalAccess";
import { useIsMobile } from "@/hooks/useMobile";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { BarChart3, CarFront, CircleHelp, ClipboardList, DoorOpen, LayoutDashboard, MapPinned, PanelLeft, PlugZap, Radio, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import React, { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

export function getMenuItems(permissions: string[] | undefined, role?: string, isSuperAdministrator = false, assignments?: AccessAssignmentLike[]) {
  const fallback = (permission: string) => role === "administrador" || (permission === "dispatch.view" && ["despachador", "supervisor"].includes(role ?? "")) || (permission === "occurrences.view" || permission === "teams.view");
  const can = (permission: string) => isSuperAdministrator || (permissions ? permissions.includes("*") || permissions.includes(permission) : fallback(permission));
  const fieldAgent = isFieldAgent(role, assignments);
  const items = [] as { icon: typeof LayoutDashboard; label: string; path: string }[];
  if (!fieldAgent && can("occurrences.view")) items.push({ icon: LayoutDashboard, label: "Central", path: "/" }, { icon: MapPinned, label: "Ocorrências", path: "/ocorrencias" });
  if (!fieldAgent && can("reports.view")) items.push({ icon: BarChart3, label: "Dashboards e Relatórios", path: "/dashboards-relatorios" });
  if (can("teams.view")) items.push({ icon: UsersRound, label: "Equipes", path: "/equipes" });
  if (!fieldAgent && can("dispatch.view")) items.push({ icon: ClipboardList, label: "Kanban", path: "/kanban" });
  if (fieldAgent || can("occurrences.transition")) items.push({ icon: Radio, label: "Aplicativo Agente", path: "/agente" });
  if (can("vehicles.manage")) items.push({ icon: CarFront, label: "Viaturas", path: "/viaturas" });
  if (can("integrations.view") || can("workflow.view")) items.push({ icon: PlugZap, label: "Integrações", path: "/integracoes" });
  if (can("users.view") || can("roles.view")) items.push({ icon: ShieldCheck, label: "Administração", path: "/administracao" });
  if (can("users.view")) items.push({ icon: UsersRound, label: "Usuários", path: "/administracao/usuarios" });
  if (can("roles.view")) items.push({ icon: ShieldCheck, label: "Perfis", path: "/administracao/perfis" });
  if (can("system.configure")) items.push({ icon: ShieldCheck, label: "Escopos", path: "/administracao/escopos" });
  if (can("audit.view")) items.push({ icon: ClipboardList, label: "Log de operações", path: "/administracao/log-operacoes" });
  if (isSuperAdministrator) items.push({ icon: Settings2, label: "Configurações", path: "/administracao/configuracoes" });
  return items;
}

export async function completeLogout(logout: () => Promise<void>, redirect: (path: string) => void) {
  await logout();
  redirect("/");
}

export function isLogoutShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "repeat">) {
  return !event.repeat && !event.altKey && event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l";
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Acesso operacional
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Entre com sua conta corporativa para acessar os recursos autorizados do AXE Dispatch.
            </p>
          </div>
          <Button
            onClick={() => startLogin()}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const sidebarRef = useRef<HTMLDivElement>(null);
  const access = trpc.access.me.useQuery(undefined, { retry: false, refetchInterval: 30_000 });
  const profilePhoto = trpc.access.myProfilePhoto.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const menuItems = getMenuItems(access.data?.permissions, user?.operationalRole, access.data?.isSuperAdministrator, access.data?.assignments);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();
  const networkState = useNetworkStatus();

  const handleLogout = useCallback(async () => {
    setLogoutError("");
    try {
      await completeLogout(logout, path => window.location.assign(path));
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Não foi possível encerrar a sessão. Tente novamente.");
    }
  }, [logout]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isLogoutShortcut(event) || isEditableTarget(event.target)) return;
      event.preventDefault();
      void handleLogout();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleLogout]);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-700 to-teal-600 text-white shadow-sm shadow-sky-900/15"
                  >
                    <ShieldCheck className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 leading-none">
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                      AXE Sistemas
                    </span>
                    <span className="mt-1 block truncate font-semibold tracking-tight">
                      AXE Dispatch
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="space-y-2 p-3">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/70 p-2 group-data-[collapsible=icon]:justify-center">
              <Avatar className="h-9 w-9 border border-sky-100 shrink-0">
                <AvatarImage src={profilePhoto.data?.url ?? undefined} alt={`Foto de ${user?.name ?? "usuário"}`} />
                <AvatarFallback className="bg-sky-50 text-xs font-semibold text-sky-800">
                  {user?.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-medium leading-none text-slate-900">{user?.name || "Usuário"}</p>
                <p className="mt-1.5 truncate text-xs text-slate-500">{user?.email || "Sessão operacional"}</p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleLogout} className="w-full justify-center gap-2 border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 hover:text-rose-900 group-data-[collapsible=icon]:px-2" aria-label="Sair do AXE Dispatch. Atalho: Control ou Command, Shift e L." aria-keyshortcuts="Control+Shift+L Meta+Shift+L" title="Sair — Ctrl/⌘ + Shift + L">
              <DoorOpen className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:hidden">Sair</span>
              <span aria-hidden="true" className="hidden items-center gap-0.5 text-[10px] font-medium text-rose-700/80 sm:flex group-data-[collapsible=icon]:hidden">
                <kbd className="rounded border border-rose-200 bg-white/70 px-1 py-0.5 font-sans leading-none">Ctrl/⌘</kbd>
                <kbd className="rounded border border-rose-200 bg-white/70 px-1 py-0.5 font-sans leading-none">⇧</kbd>
                <kbd className="rounded border border-rose-200 bg-white/70 px-1 py-0.5 font-sans leading-none">L</kbd>
              </span>
            </Button>
            {logoutError && <p role="alert" className="text-xs leading-4 text-rose-700 group-data-[collapsible=icon]:hidden">{logoutError}</p>}
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {!isMobile && (
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200/80 bg-background/95 px-5 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">Portal operacional</p>
              <p className="truncate text-xs text-slate-500">AXE Dispatch</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setLocation("/manuais-ajuda")} className="gap-2 border-sky-200 bg-sky-50/60 text-sky-900 hover:bg-sky-100 hover:text-sky-950" title="Abrir Manuais e Ajuda">
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
              Manuais e Ajuda
            </Button>
          </header>
        )}
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            <Button type="button" variant="outline" size="icon" onClick={() => setLocation("/manuais-ajuda")} className="h-9 w-9 border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 hover:text-sky-950" aria-label="Abrir Manuais e Ajuda" title="Manuais e Ajuda">
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
        {networkState === "offline" && <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">Sem conexão. As alterações serão consultadas novamente quando a rede for restabelecida.</div>}
        {networkState === "restored" && <div role="status" className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm text-emerald-900">Conexão restabelecida. O painel voltou a sincronizar automaticamente.</div>}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
