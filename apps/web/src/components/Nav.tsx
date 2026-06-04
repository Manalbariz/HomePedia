import {
  Flame,
  Home,
  Map,
  MessageCircle,
  Bell,
} from "lucide-react";
import type { AppView } from "@/types/listing";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS: { id: AppView; label: string; icon: typeof Home }[] = [
  { id: "hero", label: "Accueil", icon: Home },
  { id: "map", label: "Carte", icon: Map },
  { id: "match", label: "Match", icon: Flame },
  { id: "chat", label: "Chat", icon: MessageCircle },
];

interface NavProps {
  view: AppView;
  onNavigate: (view: AppView) => void;
}

export function Nav({ view, onNavigate }: NavProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3.5 border-b border-border backdrop-blur-xl bg-background/80">
      <button
        type="button"
        className="flex items-center gap-2"
        onClick={() => onNavigate("hero")}
      >
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
          <Home size={13} className="text-white" />
        </div>
        <span className="text-xl font-black tracking-widest text-foreground uppercase font-display">
          nido
        </span>
      </button>

      <div className="flex items-center gap-1 bg-secondary rounded-full p-1 border border-border">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              view === id
                ? "bg-primary text-white shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={13} />
            <span className="hidden sm:block">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          className="relative p-2 rounded-full hover:bg-secondary transition-colors"
          aria-label="Notifications"
        >
          <Bell size={16} className="text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
        </button>
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white">
          JD
        </div>
      </div>
    </nav>
  );
}
