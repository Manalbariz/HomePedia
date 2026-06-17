import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterListings,
  findSimilarListings,
  parseListingFilters,
} from "./filters.js";
import type { ListingRecord } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "../data/listings.json");
const PORT = Number(process.env.PORT ?? 3001);

function loadListings(): ListingRecord[] {
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw) as ListingRecord[];
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "homepedia-api" });
});

app.get("/api/listings", (req, res) => {
  const filters = parseListingFilters(req.query as Record<string, unknown>);
  const results = filterListings(loadListings(), filters);
  res.json(results);
});

app.get("/api/listings/:id/similar", (req, res) => {
  const all = loadListings();
  const base = all.find((l) => l.id === req.params.id);
  if (!base) {
    res.status(404).json({ error: "Listing not found", id: req.params.id });
    return;
  }
  res.json(findSimilarListings(base, all));
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
