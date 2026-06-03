import {
  ArrowRight,
  ChevronRight,
  Flame,
  Map,
  Users,
  Zap,
} from "lucide-react";
import type { AppView, Listing } from "@/types/listing";
import { CityMap } from "@/components/CityMap";

interface HeroViewProps {
  listings: Listing[];
  onNavigate: (view: AppView) => void;
}

export function HeroView({ listings, onNavigate }: HeroViewProps) {
  return (
    <div className="pt-[60px] min-h-screen bg-background overflow-x-hidden relative">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-[-100px] w-[700px] h-[600px] bg-accent/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-[-80px] w-[500px] h-[450px] bg-primary/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-14 pb-10 grid md:grid-cols-[1fr_1.1fr] gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-semibold px-3 py-1.5 rounded-full mb-7">
            <Zap size={11} />
            Le search immo nouvelle génération
          </div>

          <h1 className="font-display text-7xl md:text-[88px] font-black leading-none tracking-tight mb-6 text-foreground uppercase">
            TROUVEZ
            <br />
            <span className="text-primary">VOTRE</span>
            <br />
            NID.
          </h1>

          <p className="text-muted-foreground text-lg leading-relaxed max-w-sm mb-8">
            Explorez sur carte, partagez avec vos amis et découvrez votre logement
            idéal grâce aux suggestions personnalisées.
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => onNavigate("map")}
              className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full font-semibold hover:bg-primary/90 transition-all hover:gap-3 shadow-lg shadow-primary/25"
            >
              Explorer la carte <ArrowRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("match")}
              className="flex items-center gap-2 bg-secondary text-foreground px-6 py-3 rounded-full font-semibold hover:bg-secondary/60 border border-border transition-colors"
            >
              <Flame size={15} className="text-primary" /> Mes matchs
            </button>
          </div>

          <div className="flex items-center gap-8 mt-10 pt-8 border-t border-border">
            {[
              { label: "Annonces actives", value: "48 200+" },
              { label: "Utilisateurs", value: "12 000+" },
              { label: "Villes couvertes", value: "850+" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="font-display text-2xl font-black text-foreground">{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="relative rounded-2xl overflow-hidden border border-border h-[430px]">
            <CityMap listings={listings} selectedId={null} onSelect={() => {}} />
            <div className="absolute bottom-4 left-4 right-4 flex gap-2">
              {listings.slice(0, 2).map((l) => (
                <div
                  key={l.id}
                  className="flex-1 bg-card/90 backdrop-blur-sm rounded-xl p-3 border border-border"
                >
                  <div className="text-[10px] text-muted-foreground mb-1">{l.address}</div>
                  <div className="text-primary font-bold text-sm font-mono">
                    {l.price.toLocaleString("fr-FR")} €/m
                  </div>
                  <div className="text-xs text-foreground truncate">{l.title}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute -top-4 -right-4 bg-primary rounded-2xl px-4 py-3 shadow-2xl shadow-primary/40">
            <div className="text-white/80 text-[10px] font-medium uppercase tracking-wider mb-0.5">
              Score IA
            </div>
            <div className="font-display text-white text-3xl font-black leading-none">96</div>
          </div>

          <div className="absolute -bottom-3 left-6 flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1.5 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-foreground font-medium">
              3 amis cherchent en ce moment
            </span>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 pb-16 grid md:grid-cols-3 gap-4 mt-6">
        {[
          {
            icon: Map,
            title: "Visualisation Carte",
            desc: "Explorez les annonces sur une carte interactive. Filtrez par quartier, prix, surface.",
            accent: "text-accent",
            bg: "group-hover:bg-accent/10",
            action: "map" as AppView,
            label: "Voir la carte",
          },
          {
            icon: Flame,
            title: "Suggestions Match",
            desc: "Notre IA analyse vos swipes et visites pour proposer des biens toujours plus pertinents.",
            accent: "text-primary",
            bg: "group-hover:bg-primary/10",
            action: "match" as AppView,
            label: "Swiper",
          },
          {
            icon: Users,
            title: "Chercher à Plusieurs",
            desc: "Partagez des annonces avec vos proches, débattez en direct, décidez ensemble.",
            accent: "text-[#2EC4B6]",
            bg: "group-hover:bg-[#2EC4B6]/10",
            action: "chat" as AppView,
            label: "Ouvrir le chat",
          },
        ].map(({ icon: Icon, title, desc, accent, bg, action, label }) => (
          <button
            key={title}
            type="button"
            onClick={() => onNavigate(action)}
            className={`text-left bg-card rounded-2xl p-6 border border-border hover:border-white/20 transition-all group cursor-pointer ${bg}`}
          >
            <div
              className={`w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-4 ${accent}`}
            >
              <Icon size={18} />
            </div>
            <h3 className="font-display text-xl font-bold text-foreground mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{desc}</p>
            <span
              className={`text-sm font-semibold inline-flex items-center gap-1 ${accent} group-hover:gap-2 transition-all`}
            >
              {label} <ChevronRight size={14} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
