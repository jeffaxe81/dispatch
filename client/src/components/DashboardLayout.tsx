import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { trpc } from "@/lib/trpc";
import { isFieldAgent, type AccessAssignmentLike } from "@/lib/operationalAccess";
import { useIsMobile } from "@/hooks/useMobile";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { BarChart3, CarFront, CircleHelp, ClipboardList, Clock3, DoorOpen, LayoutDashboard, MapPinned, PanelLeft, PlugZap, Radio, Settings2, ShieldCheck, UsersRound } from "lucide-react";
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
  if (!fieldAgent && can("work_shift_operations.view")) items.push({ icon: Clock3, label: "Operação de Jornada", path: "/operacao-jornada" });
  if (!fieldAgent && can("reports.view")) items.push({ icon: BarChart3, label: "Dashboards e Relatórios", path: "/dashboards-relatorios" });
  if (can("teams.view")) items.push({ icon: UsersRound, label: "Equipes", path: "/equipes" });
  if (!fieldAgent && can("dispatch.view")) items.push({ icon: ClipboardList, label: "Kanban", path: "/kanban" });
  if (fieldAgent || can("occurrences.transition")) items.push({ icon: Radio, label: "Aplicativo Agente", path: "/agente" });
  if (can("vehicles.manage")) items.push({ icon: CarFront, label: "Viaturas", path: "/viaturas" });
  if (can("integrations.view") || can("workflow.view")) items.push({ icon: PlugZap, label: "Integrações", path: "/integracoes" });
  if (can("users.view") || can("roles.view")) items.push({ icon: ShieldCheck, label: "Administração", path: "/administracao" });
  if (can("users.view")) items.push({ icon: UsersRound, label: "Usuários", path: "/administracao/usuarios" }, { icon: ShieldCheck, label: "Credenciais locais", path: "/administracao/credenciais" });
  if (can("roles.view")) items.push({ icon: ShieldCheck, label: "Perfis", path: "/administracao/perfis" });
  if (can("system.configure")) items.push({ icon: ShieldCheck, label: "Escopos", path: "/administracao/escopos" });
  if (can("audit.view")) items.push({ icon: ClipboardList, label: "Log de operações", path: "/administracao/log-operacoes" });
  if (isSuperAdministrator) items.push({ icon: Settings2, label: "Configurações", path: "/administracao/configuracoes" });
  return items;
}

export async function completeLogout(logout: () => Promise<void>, redirect: (path: string) => void) { await logout(); redirect("/"); }
export function isLogoutShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "repeat">) { return !event.repeat && !event.altKey && event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l"; }
function isEditableTarget(target: EventTarget | null) { if (!(target instanceof HTMLElement)) return false; return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName); }
const SIDEBAR_WIDTH_KEY = "sidebar-width"; const DEFAULT_WIDTH = 280; const MIN_WIDTH = 200; const MAX_WIDTH = 480;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth,setSidebarWidth]=useState(()=>{const saved=localStorage.getItem(SIDEBAR_WIDTH_KEY);return saved?parseInt(saved,10):DEFAULT_WIDTH;});const {loading,user}=useAuth();
  useEffect(()=>{localStorage.setItem(SIDEBAR_WIDTH_KEY,sidebarWidth.toString());},[sidebarWidth]);
  if(loading)return <DashboardLayoutSkeleton/>;
  if(!user)return <div className="flex items-center justify-center min-h-screen"><div className="flex flex-col items-center gap-8 p-8 max-w-md w-full"><div className="flex flex-col items-center gap-6"><h1 className="text-2xl font-semibold tracking-tight text-center">Acesso operacional</h1><p className="text-sm text-muted-foreground text-center max-w-sm">Entre com seu usuário e senha para acessar os recursos autorizados do AXE Dispatch.</p></div><Button onClick={()=>window.location.assign("/login")} size="lg" className="w-full shadow-lg hover:shadow-xl transition-all">Entrar</Button></div></div>;
  return <SidebarProvider style={{"--sidebar-width":`${sidebarWidth}px`} as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}
function DashboardLayoutContent({children,setSidebarWidth}:{children:React.ReactNode;setSidebarWidth:(width:number)=>void}){
  const {user,logout}=useAuth();const [location]=useLocation();const {state,toggleSidebar}=useSidebar();const isCollapsed=state==="collapsed";const [isResizing,setIsResizing]=useState(false);const [logoutError,setLogoutError]=useState("");const sidebarRef=useRef<HTMLDivElement>(null);const access=trpc.access.me.useQuery(undefined,{retry:false,refetchInterval:30_000});const profilePhoto=trpc.access.myProfilePhoto.useQuery(undefined,{retry:false,staleTime:60_000});const menuItems=getMenuItems(access.data?.permissions,user?.operationalRole,access.data?.isSuperAdministrator,access.data?.assignments);const activeMenuItem=menuItems.find(item=>item.path===location);const isMobile=useIsMobile();const networkState=useNetworkStatus();
  const handleLogout=useCallback(async()=>{setLogoutError("");try{await completeLogout(logout,path=>window.location.assign(path));}catch(error){setLogoutError(error instanceof Error?error.message:"Não foi possível encerrar a sessão. Tente novamente.");}},[logout]);
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(!isLogoutShortcut(event)||isEditableTarget(event.target))return;event.preventDefault();void handleLogout();};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);},[handleLogout]);
  useEffect(()=>{if(isCollapsed)setIsResizing(false);},[isCollapsed]);
  useEffect(()=>{const move=(e:MouseEvent)=>{if(!isResizing)return;const left=sidebarRef.current?.getBoundingClientRect().left??0;const width=e.clientX-left;if(width>=MIN_WIDTH&&width<=MAX_WIDTH)setSidebarWidth(width);};const up=()=>setIsResizing(false);if(isResizing){document.addEventListener("mousemove",move);document.addEventListener("mouseup",up);document.body.style.cursor="col-resize";document.body.style.userSelect="none";}return()=>{document.removeEventListener("mousemove",move);document.removeEventListener("mouseup",up);document.body.style.cursor="";document.body.style.userSelect="";};},[isResizing,setSidebarWidth]);
  return <><div className="relative" ref={sidebarRef}><Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}><SidebarHeader className="h-16 justify-center"><div className="flex items-center gap-3 px-2 w-full"><button onClick={toggleSidebar} className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg" aria-label="Toggle navigation"><PanelLeft className="h-4 w-4 text-muted-foreground"/></button>{!isCollapsed&&<strong className="text-sm">AXE Dispatch</strong>}</div></SidebarHeader><SidebarContent><SidebarMenu>{menuItems.map(item=><SidebarMenuItem key={item.path}><SidebarMenuButton isActive={activeMenuItem?.path===item.path} onClick={()=>window.location.assign(item.path)} tooltip={item.label}><item.icon/><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter><div className="px-2 py-2 text-xs text-muted-foreground">{networkState.isOnline?"Online":"Offline"}</div><div className="flex items-center gap-2 px-2 py-2"><Avatar className="h-8 w-8"><AvatarImage src={profilePhoto.data?.photoUrl??undefined}/><AvatarFallback>{user?.name?.slice(0,2).toUpperCase()??"AX"}</AvatarFallback></Avatar>{!isCollapsed&&<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user?.name}</p><p className="truncate text-xs text-muted-foreground">{user?.operationalRole}</p></div>}<Button variant="ghost" size="icon" onClick={handleLogout}><DoorOpen className="h-4 w-4"/></Button></div>{logoutError&&<p className="px-2 text-xs text-destructive">{logoutError}</p>}</SidebarFooter></Sidebar>{!isCollapsed&&!isMobile&&<div className="absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize" onMouseDown={()=>setIsResizing(true)}/>}</div><SidebarInset><header className="flex h-14 items-center gap-3 border-b px-4"><SidebarTrigger/><span className="text-sm font-medium">{activeMenuItem?.label??"AXE Dispatch"}</span><div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"><CircleHelp className="h-4 w-4"/>Central Operacional</div></header><main className="flex-1 p-4 md:p-6">{children}</main></SidebarInset></>;
}
