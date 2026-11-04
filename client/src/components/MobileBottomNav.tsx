import { Menu } from "lucide-react";
import type { ComponentType } from "react";
import { isMobileTabActive, selectMobileTabs } from "@/lib/mobileNavigation";

export type ResponsiveNavItem = {
  path: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export function MobileBottomNav({
  items, currentPath, onNavigate, onMore, expanded,
}: {
  items: readonly ResponsiveNavItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onMore: () => void;
  expanded: boolean;
}) {
  const tabs = selectMobileTabs(items);
  return (
    <nav
      className="dispatch-mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-background/95 shadow-[0_-8px_32px_rgba(15,23,42,0.08)] backdrop-blur md:hidden"
      aria-label="Navegação principal mobile"
    >
      <div className="mx-auto flex max-w-xl items-stretch justify-around gap-1 px-2 pt-1.5">
        {tabs.map(item => {
          const selected = isMobileTabActive(currentPath, item.path);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => onNavigate(item.path)}
              className={"flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-600 " + (selected ? "bg-sky-50 font-semibold text-sky-800" : "text-slate-600 hover:bg-slate-50")}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate text-[10px] leading-3">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-label="Abrir menu completo"
          aria-expanded={expanded}
          onClick={onMore}
          className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600"
        >
          <Menu className="h-5 w-5 shrink-0" />
          <span className="text-[10px] leading-3">Mais</span>
        </button>
      </div>
    </nav>
  );
}
