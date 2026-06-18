import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import { scrapeListingUrl } from "@/api/client";
import type { ComparedListing } from "@/types/compare";

// ── DPE badge ─────────────────────────────────────────────────────────────
const DPE_COLORS: Record<string, string> = {
  A: "bg-green-500",
  B: "bg-lime-500",
  C: "bg-yellow-400",
  D: "bg-orange-400",
  E: "bg-orange-600",
  F: "bg-red-500",
  G: "bg-red-700",
};

function DpeBadge({ grade }: { grade: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded text-white text-xs font-bold ${DPE_COLORS[grade] ?? "bg-muted"}`}
    >
      {grade}
    </span>
  );
}

// ── Boolean display ────────────────────────────────────────────────────────
function BoolCell({ val }: { val: boolean | undefined }) {
  return (
    <span className="flex items-center justify-center">
      {val === true ? (
        <CheckCircle size={16} className="text-green-500" />
      ) : val === false ? (
        <XCircle size={16} className="text-muted-foreground/40" />
      ) : (
        <span className="text-muted-foreground/30 text-xs">—</span>
      )}
    </span>
  );
}

// ── URL input ──────────────────────────────────────────────────────────────
interface UrlInputProps {
  index: number;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}

function UrlInput({ index, value, onChange, disabled }: UrlInputProps) {
  return (
    <div className="flex-1">
      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">
        Annonce {index + 1}
      </label>
      <div className="relative">
        <input
          type="url"
          placeholder="https://www.seloger.com/annonces/..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50 transition-colors"
        />
      </div>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden animate-pulse">
      <div className="h-44 bg-secondary" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-secondary rounded w-3/4" />
        <div className="h-3 bg-secondary rounded w-1/2" />
        <div className="h-3 bg-secondary rounded w-2/3" />
      </div>
    </div>
  );
}

// ── Comparison table ───────────────────────────────────────────────────────
type Highlight = "a" | "b" | "none" | "equal";

interface Row {
  label: string;
  render: (l: ComparedListing) => React.ReactNode;
  /** optional comparator: positive = A is better */
  compare?: (a: ComparedListing, b: ComparedListing) => number;
  /** true if higher value is better (default), false if lower is better */
  higherIsBetter?: boolean;
}

const ROWS: Row[] = [
  {
    label: "Prix",
    render: (l) =>
      l.price != null ? (
        <span className="font-bold font-mono text-foreground">
          {l.price.toLocaleString("fr-FR")} €
        </span>
      ) : (
        <span className="text-muted-foreground/40 text-xs">—</span>
      ),
    compare: (a, b) =>
      a.price != null && b.price != null ? b.price - a.price : 0,
    higherIsBetter: false,
  },
  {
    label: "Surface",
    render: (l) =>
      l.surface != null ? `${l.surface} m²` : <span className="text-muted-foreground/40 text-xs">—</span>,
    compare: (a, b) =>
      a.surface != null && b.surface != null ? a.surface - b.surface : 0,
    higherIsBetter: true,
  },
  {
    label: "Pièces",
    render: (l) =>
      l.rooms != null ? l.rooms : <span className="text-muted-foreground/40 text-xs">—</span>,
    compare: (a, b) =>
      a.rooms != null && b.rooms != null ? a.rooms - b.rooms : 0,
    higherIsBetter: true,
  },
  {
    label: "Chambres",
    render: (l) =>
      l.bedrooms != null ? l.bedrooms : <span className="text-muted-foreground/40 text-xs">—</span>,
    compare: (a, b) =>
      a.bedrooms != null && b.bedrooms != null ? a.bedrooms - b.bedrooms : 0,
    higherIsBetter: true,
  },
  {
    label: "Prix/m²",
    render: (l) =>
      l.price != null && l.surface != null ? (
        <span className="font-mono">
          {Math.round(l.price / l.surface).toLocaleString("fr-FR")} €/m²
        </span>
      ) : (
        <span className="text-muted-foreground/40 text-xs">—</span>
      ),
    compare: (a, b) => {
      const ra = a.price != null && a.surface != null ? a.price / a.surface : undefined;
      const rb = b.price != null && b.surface != null ? b.price / b.surface : undefined;
      return ra != null && rb != null ? rb - ra : 0;
    },
    higherIsBetter: false,
  },
  {
    label: "Étage",
    render: (l) =>
      l.floor ?? <span className="text-muted-foreground/40 text-xs">—</span>,
  },
  {
    label: "Charges",
    render: (l) =>
      l.charges != null ? `${l.charges} €/mois` : <span className="text-muted-foreground/40 text-xs">—</span>,
    compare: (a, b) =>
      a.charges != null && b.charges != null ? b.charges - a.charges : 0,
    higherIsBetter: false,
  },
  {
    label: "Dépôt de garantie",
    render: (l) =>
      l.deposit != null ? `${l.deposit.toLocaleString("fr-FR")} €` : <span className="text-muted-foreground/40 text-xs">—</span>,
    compare: (a, b) =>
      a.deposit != null && b.deposit != null ? b.deposit - a.deposit : 0,
    higherIsBetter: false,
  },
  {
    label: "DPE",
    render: (l) => (l.dpe ? <DpeBadge grade={l.dpe} /> : <span className="text-muted-foreground/40 text-xs">—</span>),
    compare: (a, b) => {
      const grades = ["A", "B", "C", "D", "E", "F", "G"];
      const ia = a.dpe ? grades.indexOf(a.dpe) : undefined;
      const ib = b.dpe ? grades.indexOf(b.dpe) : undefined;
      return ia != null && ib != null ? ib - ia : 0;
    },
    higherIsBetter: true,
  },
  {
    label: "GES",
    render: (l) => (l.ges ? <DpeBadge grade={l.ges} /> : <span className="text-muted-foreground/40 text-xs">—</span>),
    compare: (a, b) => {
      const grades = ["A", "B", "C", "D", "E", "F", "G"];
      const ia = a.ges ? grades.indexOf(a.ges) : undefined;
      const ib = b.ges ? grades.indexOf(b.ges) : undefined;
      return ia != null && ib != null ? ib - ia : 0;
    },
    higherIsBetter: true,
  },
  { label: "Ascenseur", render: (l) => <BoolCell val={l.elevator} /> },
  { label: "Parking", render: (l) => <BoolCell val={l.parking} /> },
  { label: "Cave", render: (l) => <BoolCell val={l.cellar} /> },
  { label: "Balcon", render: (l) => <BoolCell val={l.balcony} /> },
  { label: "Terrasse", render: (l) => <BoolCell val={l.terrace} /> },
  { label: "Meublé", render: (l) => <BoolCell val={l.furnished} /> },
];

function getHighlight(row: Row, a: ComparedListing, b: ComparedListing): Highlight {
  if (!row.compare) return "none";
  const diff = row.compare(a, b);
  if (diff === 0) return "equal";
  return diff > 0 ? "a" : "b";
}

interface CompareTableProps {
  a: ComparedListing;
  b: ComparedListing;
}

function CompareTable({ a, b }: CompareTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider w-32">
              Critère
            </th>
            <th className="px-4 py-3 text-center font-semibold text-foreground">
              Annonce 1
            </th>
            <th className="px-4 py-3 text-center font-semibold text-foreground">
              Annonce 2
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => {
            const highlight = getHighlight(row, a, b);
            return (
              <tr
                key={row.label}
                className={`border-b border-border/50 last:border-0 ${i % 2 === 0 ? "bg-background/30" : ""}`}
              >
                <td className="px-4 py-3 text-muted-foreground text-xs font-medium whitespace-nowrap">
                  {row.label}
                </td>
                <td
                  className={`px-4 py-3 text-center transition-colors ${
                    highlight === "a"
                      ? "bg-green-500/10 text-green-400"
                      : highlight === "equal"
                        ? "bg-accent/5"
                        : ""
                  }`}
                >
                  {row.render(a)}
                </td>
                <td
                  className={`px-4 py-3 text-center transition-colors ${
                    highlight === "b"
                      ? "bg-green-500/10 text-green-400"
                      : highlight === "equal"
                        ? "bg-accent/5"
                        : ""
                  }`}
                >
                  {row.render(b)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Result card header ─────────────────────────────────────────────────────
function ListingHeader({ listing, index }: { listing: ComparedListing; index: number }) {
  const photo = listing.photos?.[0];
  return (
    <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden">
      {photo ? (
        <img
          src={photo}
          alt={listing.title ?? `Annonce ${index + 1}`}
          className="w-full h-44 object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-full h-44 bg-secondary flex items-center justify-center">
          <span className="text-muted-foreground text-xs">Pas de photo</span>
        </div>
      )}
      <div className="p-4">
        <div className="text-[10px] text-accent font-semibold uppercase tracking-wider mb-1">
          {listing.source}
        </div>
        <h3 className="text-foreground font-semibold text-sm leading-snug mb-1 line-clamp-2">
          {listing.title ?? `Annonce ${index + 1}`}
        </h3>
        {listing.city && (
          <p className="text-muted-foreground text-xs">{listing.city}</p>
        )}
        {listing.price != null && (
          <p className="text-primary font-bold font-mono mt-2 text-lg">
            {listing.price.toLocaleString("fr-FR")} €
          </p>
        )}
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 font-medium transition-colors"
        >
          Voir l'annonce <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function CompareSection() {
  const [urls, setUrls] = useState(["", ""]);
  const [results, setResults] = useState<(ComparedListing | null)[]>([null, null]);
  const [errors, setErrors] = useState<(string | null)[]>([null, null]);
  const [loading, setLoading] = useState(false);

  const bothFilled = urls[0].trim() !== "" && urls[1].trim() !== "";

  async function handleCompare() {
    setLoading(true);
    setErrors([null, null]);
    setResults([null, null]);

    const settled = await Promise.allSettled(
      urls.map((u) => scrapeListingUrl(u.trim()))
    );

    const newResults: (ComparedListing | null)[] = [null, null];
    const newErrors: (string | null)[] = [null, null];

    settled.forEach((r, i) => {
      if (r.status === "fulfilled") {
        newResults[i] = r.value;
      } else {
        const err = r.reason as Error;
        newErrors[i] = err.message ?? "Erreur lors du scraping";
      }
    });

    setResults(newResults);
    setErrors(newErrors);
    setLoading(false);
  }

  const bothLoaded = results[0] !== null && results[1] !== null;

  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 pt-14 pb-20">
      {/* Header */}
      <div className="text-center mb-10">
        <h2 className="font-display text-5xl md:text-6xl font-black uppercase text-foreground tracking-tight">
          COMPAREZ
          <br />
          <span className="text-accent">EN UN CLIC</span>
        </h2>
        <p className="text-muted-foreground mt-4 max-w-md mx-auto text-sm leading-relaxed">
          Collez deux URLs d'annonces (SeLoger, BienIci, Leboncoin…) et obtenez
          une comparaison côte à côte instantanée.
        </p>
      </div>

      {/* URL inputs */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-8 shadow-elevated">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          {urls.map((u, i) => (
            <UrlInput
              key={i}
              index={i}
              value={u}
              onChange={(v) =>
                setUrls((prev) => {
                  const next = [...prev];
                  next[i] = v;
                  return next;
                })
              }
              disabled={loading}
            />
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleCompare()}
            disabled={!bothFilled || loading}
            className="flex items-center gap-2 bg-accent text-white px-7 py-3 rounded-full font-semibold text-sm hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-accent/25"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Scraping…
              </>
            ) : (
              <>
                Comparer <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {loading && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex gap-4 mb-6"
          >
            <CardSkeleton />
            <CardSkeleton />
          </motion.div>
        )}

        {!loading && (results[0] !== null || results[1] !== null) && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {/* Error banners */}
            {errors.map((err, i) =>
              err ? (
                <div
                  key={i}
                  className="mb-4 flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-sm px-4 py-3 rounded-xl"
                >
                  <XCircle size={15} />
                  <span>
                    <strong>Annonce {i + 1} :</strong> {err}
                  </span>
                </div>
              ) : null
            )}

            {/* Headers side by side */}
            <div className="flex gap-4 mb-6">
              {results.map((r, i) =>
                r ? (
                  <ListingHeader key={i} listing={r} index={i} />
                ) : (
                  <div
                    key={i}
                    className="flex-1 bg-card border border-primary/20 rounded-2xl flex items-center justify-center h-32 text-muted-foreground text-sm"
                  >
                    Non chargé
                  </div>
                )
              )}
            </div>

            {/* Comparison table */}
            {bothLoaded && (
              <CompareTable
                a={results[0] as ComparedListing}
                b={results[1] as ComparedListing}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
