import { useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { Heart, MapPin, X } from "lucide-react";
import type { Listing } from "@/types/listing";

interface MatchViewProps {
  listings: Listing[];
}

function MatchCard({
  listing,
  isTop,
  stackIndex,
  onLike,
  onDislike,
}: {
  listing: Listing;
  isTop: boolean;
  stackIndex: number;
  onLike: () => void;
  onDislike: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-14, 14]);
  const likeOpacity = useTransform(x, [20, 90], [0, 1]);
  const nopeOpacity = useTransform(x, [-90, -20], [1, 0]);

  return (
    <motion.div
      className="absolute inset-0"
      style={{
        x: isTop ? x : 0,
        rotate: isTop ? rotate : 0,
        scale: 1 - stackIndex * 0.04,
        y: stackIndex * 14,
        zIndex: 10 - stackIndex,
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        if (info.offset.x > 80) onLike();
        else if (info.offset.x < -80) onDislike();
      }}
    >
      <div className="w-full h-full rounded-3xl overflow-hidden border border-border bg-card relative shadow-2xl shadow-black/50 cursor-grab active:cursor-grabbing">
        <div className="relative h-[58%] overflow-hidden bg-muted">
          <img src={listing.imageUrl} alt={listing.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
          {isTop && (
            <>
              <motion.div
                className="absolute top-5 left-5 bg-green-500 text-white font-black text-2xl px-4 py-2 rounded-2xl border-4 border-green-400 -rotate-[18deg] uppercase"
                style={{ opacity: likeOpacity }}
              >
                LIKE
              </motion.div>
              <motion.div
                className="absolute top-5 right-5 bg-primary text-white font-black text-2xl px-4 py-2 rounded-2xl border-4 border-primary/60 rotate-[18deg] uppercase"
                style={{ opacity: nopeOpacity }}
              >
                NOPE
              </motion.div>
            </>
          )}
        </div>
        <div className="p-6">
          <div className="flex items-start justify-between mb-2">
            <h2 className="font-display text-2xl font-bold text-foreground">{listing.title}</h2>
            <span className="bg-primary/15 text-primary text-sm font-bold px-3 py-1 rounded-full">
              {listing.score}%
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground text-sm mb-4">
            <MapPin size={13} /> {listing.address}
          </div>
          <div className="font-mono text-3xl font-bold text-primary mb-4">
            {listing.price.toLocaleString("fr-FR")} €
            <span className="text-base font-normal text-muted-foreground">/mois</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {listing.tags.map((t) => (
              <span
                key={t}
                className="text-xs bg-secondary text-muted-foreground px-3 py-1 rounded-full border border-border"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function MatchView({ listings }: MatchViewProps) {
  const [stack, setStack] = useState(listings.map((l) => l.id));
  const [liked, setLiked] = useState<string[]>([]);

  const advance = (id: string, wasLike: boolean) => {
    if (wasLike) setLiked((prev) => [...prev, id]);
    setStack((prev) => prev.filter((x) => x !== id));
  };

  const visible = stack
    .slice(0, 3)
    .map((id) => listings.find((l) => l.id === id))
    .filter((l): l is Listing => Boolean(l));

  return (
    <div className="pt-[60px] min-h-screen bg-background flex flex-col items-center px-4">
      <div className="text-center mb-6 mt-6">
        <h1 className="font-display text-4xl font-black text-foreground uppercase tracking-tight">
          Match
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Basé sur vos visites ·{" "}
          <span className="text-primary font-semibold">{liked.length} favoris</span>
        </p>
      </div>

      <div className="relative w-full max-w-sm h-[520px] mb-8">
        <AnimatePresence>
          {visible.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 border border-border rounded-3xl bg-card">
              <p className="text-foreground font-semibold mb-2">Plus d&apos;annonces !</p>
              <p className="text-sm text-muted-foreground">
                Revenez plus tard ou élargissez vos filtres.
              </p>
            </div>
          ) : (
            visible.map((listing, i) => (
              <MatchCard
                key={listing.id}
                listing={listing}
                isTop={i === 0}
                stackIndex={i}
                onLike={() => advance(listing.id, true)}
                onDislike={() => advance(listing.id, false)}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-6 mb-10">
        <button
          type="button"
          aria-label="Passer"
          onClick={() => visible[0] && advance(visible[0].id, false)}
          className="w-14 h-14 rounded-full border-2 border-primary/40 flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
        >
          <X size={24} />
        </button>
        <button
          type="button"
          aria-label="J'aime"
          onClick={() => visible[0] && advance(visible[0].id, true)}
          className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/40 hover:bg-primary/90 transition-colors"
        >
          <Heart size={28} fill="white" />
        </button>
      </div>
    </div>
  );
}
