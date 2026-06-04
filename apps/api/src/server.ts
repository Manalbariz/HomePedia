import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "../data/listings.json");
const PORT = Number(process.env.PORT ?? 3001);

export interface ListingRecord {
  id: string;
  title: string;
  address: string;
  price: number;
  rooms: number;
  surface: number;
  floor: string;
  tags: string[];
  score: number;
  imageUrl: string;
  lat: number;
  lon: number;
  source: string;
  url: string;
}

function loadListings(): ListingRecord[] {
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw) as ListingRecord[];
}

/** Ville normalisée pour rapprocher les annonces (mock — Spark plus tard). */
function extractCity(address: string): string {
  const tail = address.includes(",")
    ? address.split(",").pop()!.trim()
    : address;
  const lower = tail.toLowerCase();
  if (lower.includes("paris")) return "paris";
  if (lower.includes("lyon")) return "lyon";
  if (lower.includes("bordeaux") || lower.includes("mérignac") || lower.includes("merignac"))
    return "bordeaux";
  if (lower.includes("marseille")) return "marseille";
  if (lower.includes("nantes")) return "nantes";
  if (lower.includes("lille")) return "lille";
  if (lower.includes("toulouse")) return "toulouse";
  if (lower.includes("saint-malo")) return "saint-malo";
  if (lower.includes("strasbourg")) return "strasbourg";
  return lower;
}

function findSimilar(base: ListingRecord, all: ListingRecord[], limit = 6): ListingRecord[] {
  const city = extractCity(base.address);
  const scored = all
    .filter((l) => l.id !== base.id && extractCity(l.address) === city)
    .map((l) => {
      const priceDelta = Math.abs(l.price - base.price) / Math.max(base.price, 1);
      const surfaceDelta =
        Math.abs(l.surface - base.surface) / Math.max(base.surface, 1);
      const distKm =
        Math.hypot((l.lat - base.lat) * 111, (l.lon - base.lon) * 85) || 0;
      const score = priceDelta * 2 + surfaceDelta + distKm * 0.05;
      return { l, score };
    })
    .filter(({ score }) => score < 1.2)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ l }) => l);
  return scored;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "homepedia-api" });
});

app.get("/api/listings", (_req, res) => {
  res.json(loadListings());
});

app.get("/api/listings/:id/similar", (req, res) => {
  const all = loadListings();
  const base = all.find((l) => l.id === req.params.id);
  if (!base) {
    res.status(404).json({ error: "Listing not found", id: req.params.id });
    return;
  }
  res.json(findSimilar(base, all));
});

app.get("/api/listings/:id", (req, res) => {
  const listing = loadListings().find((l) => l.id === req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found", id: req.params.id });
    return;
  }
  res.json(listing);
});

app.listen(PORT, () => {
  console.log(`homepedia-api http://localhost:${PORT}`);
});
