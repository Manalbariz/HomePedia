import { X } from "lucide-react";
import {
  LISTING_SOURCES,
  type ListingFilters,
} from "@/types/filters";

interface MapFiltersPanelProps {
  filters: ListingFilters;
  onChange: (patch: Partial<ListingFilters>) => void;
  onReset: () => void;
  onClose: () => void;
}

export function MapFiltersPanel({
  filters,
  onChange,
  onReset,
  onClose,
}: MapFiltersPanelProps) {
  return (
    <div className="mt-3 bg-card border border-border rounded-2xl shadow-elevated p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Filtres</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-secondary text-muted-foreground"
          aria-label="Fermer les filtres"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block text-xs text-muted-foreground">
          Source
          <select
            value={filters.source ?? ""}
            onChange={(e) =>
              onChange({ source: (e.target.value || undefined) as ListingFilters["source"] })
            }
            className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent"
          >
            {LISTING_SOURCES.map(({ value, label }) => (
              <option key={label} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-muted-foreground">
          Prix min (€/mois)
          <input
            type="number"
            min={0}
            step={50}
            value={filters.minPrice ?? ""}
            onChange={(e) =>
              onChange({
                minPrice: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="600"
            className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        <label className="block text-xs text-muted-foreground">
          Prix max (€/mois)
          <input
            type="number"
            min={0}
            step={50}
            value={filters.maxPrice ?? ""}
            onChange={(e) =>
              onChange({
                maxPrice: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="3000"
            className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        <label className="block text-xs text-muted-foreground">
          Pièces min.
          <select
            value={filters.minRooms ?? ""}
            onChange={(e) =>
              onChange({
                minRooms: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Toutes</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onReset}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Réinitialiser
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm bg-primary text-white rounded-xl font-semibold hover:bg-primary/90"
        >
          Appliquer
        </button>
      </div>
    </div>
  );
}
