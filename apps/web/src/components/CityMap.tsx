import type { Listing } from "@/types/listing";

const BLOCKS: [number, number, number, number][] = [
  [5, 5, 16, 12],
  [24, 5, 14, 10],
  [42, 5, 18, 13],
  [64, 5, 22, 9],
  [5, 22, 11, 16],
  [20, 20, 16, 14],
  [40, 22, 20, 15],
  [65, 18, 20, 13],
  [5, 44, 13, 13],
  [22, 42, 18, 15],
  [44, 42, 17, 14],
  [65, 38, 20, 14],
  [5, 62, 16, 17],
  [25, 60, 20, 13],
  [49, 60, 18, 16],
  [72, 58, 14, 18],
];

interface CityMapProps {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Placeholder carte (Leaflet à l’étape suivante) */
export function CityMap({ listings, selectedId, onSelect }: CityMapProps) {
  return (
    <div className="absolute inset-0 bg-[#070B18]">
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {BLOCKS.map(([x, y, w, h], i) => (
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={0.8}
            fill="rgba(255,255,255,0.03)"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={0.15}
          />
        ))}
        <path
          d="M 15 50 Q 40 30 65 55 T 90 40"
          fill="none"
          stroke="rgba(79,88,232,0.25)"
          strokeWidth={0.6}
        />
      </svg>

      {listings.map((l) => {
        const active = selectedId === l.id;
        return (
          <button
            key={l.id}
            type="button"
            className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110"
            style={{ left: `${l.mapX}%`, top: `${l.mapY}%` }}
            onClick={() => onSelect(l.id)}
            aria-label={l.title}
          >
            <span
              className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-[10px] font-bold font-mono shadow-lg ${
                active
                  ? "bg-primary border-white text-white scale-125"
                  : "bg-card border-primary/60 text-primary"
              }`}
            >
              {Math.round(l.price / 100)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
