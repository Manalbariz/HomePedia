import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ScrapeError, debugPage, scrapeUrl } from "./scrapers/index.js";
import {
  filterListings,
  findSimilarListings,
  parseListingFilters,
} from "./filters.js";
import { buildCreatedEvent } from "./kafka/events.js";
import { isKafkaEnabled, publishListingEvent } from "./kafka/producer.js";
import {
  isSparkSimilarEnabled,
  loadSimilarIndex,
  resolveSimilarFromIndex,
  writeListingsSnapshot,
} from "./spark/similarIndex.js";
import type { ListingRecord } from "./types.js";
import { chatRouter } from "./chat.js";
import { getCorsOrigins, isScrapeEnabled } from "./security.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "../data/listings.json");

function loadListingsFromDisk(): ListingRecord[] {
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw) as ListingRecord[];
}

let listingsStore: ListingRecord[] = loadListingsFromDisk();

function isValidListingBody(body: unknown): body is Omit<ListingRecord, "id"> & { id?: string } {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.title === "string" &&
    typeof b.address === "string" &&
    typeof b.price === "number" &&
    typeof b.rooms === "number" &&
    typeof b.surface === "number" &&
    typeof b.lat === "number" &&
    typeof b.lon === "number" &&
    typeof b.source === "string"
  );
}

const scrapeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes de scraping, réessayez plus tard" },
});

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: getCorsOrigins(), credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    const similarIndex = loadSimilarIndex();
    res.json({
      status: "ok",
      service: "homepedia-api",
      kafka: { enabled: isKafkaEnabled() },
      spark: {
        enabled: isSparkSimilarEnabled(),
        indexGeneratedAt: similarIndex?.generatedAt ?? null,
      },
      listings: listingsStore.length,
    });
  });

  app.use("/api", chatRouter);

  app.get("/api/listings", (req, res) => {
    const filters = parseListingFilters(req.query as Record<string, unknown>);
    const results = filterListings(listingsStore, filters);
    res.json(results);
  });

  app.post("/api/listings", async (req, res) => {
    if (!isValidListingBody(req.body)) {
      res.status(400).json({
        error: "Invalid listing body",
        required: ["title", "address", "price", "rooms", "surface", "lat", "lon", "source"],
      });
      return;
    }

    const body = req.body;
    const listing: ListingRecord = {
      id: body.id ?? randomUUID(),
      title: body.title,
      address: body.address,
      price: body.price,
      rooms: body.rooms,
      surface: body.surface,
      floor: body.floor ?? "—",
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      score: typeof body.score === "number" ? body.score : 75,
      imageUrl: body.imageUrl ?? "https://picsum.photos/seed/new/800/600",
      lat: body.lat,
      lon: body.lon,
      source: body.source,
      url: body.url ?? `https://example.com/listings/${body.id ?? "new"}`,
    };

    if (listingsStore.some((l) => l.id === listing.id)) {
      res.status(409).json({ error: "Listing id already exists", id: listing.id });
      return;
    }

    listingsStore = [...listingsStore, listing];
    writeListingsSnapshot(listingsStore);
    await publishListingEvent(buildCreatedEvent(listing));
    res.status(201).json(listing);
  });

  app.get("/api/listings/:id/similar", (req, res) => {
    const base = listingsStore.find((l) => l.id === req.params.id);
    if (!base) {
      res.status(404).json({ error: "Listing not found", id: req.params.id });
      return;
    }

    if (isSparkSimilarEnabled()) {
      const index = loadSimilarIndex();
      if (index) {
        const fromSpark = resolveSimilarFromIndex(base.id, listingsStore, index);
        if (fromSpark.length > 0) {
          res.json(fromSpark);
          return;
        }
      }
    }

    res.json(findSimilarListings(base, listingsStore));
  });

  app.get("/api/listings/:id", (req, res) => {
    const listing = listingsStore.find((l) => l.id === req.params.id);
    if (!listing) {
      res.status(404).json({ error: "Listing not found", id: req.params.id });
      return;
    }
    res.json(listing);
  });

  if (isScrapeEnabled()) {
    app.get("/api/debug-page", scrapeLimiter, async (req, res) => {
      const { url } = req.query as { url?: string };
      if (!url) {
        res.status(400).json({ error: "Query param 'url' requis" });
        return;
      }
      try {
        const dump = await debugPage(url);
        res.json(dump);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        res.status(500).json({ error: msg });
      }
    });

    app.post("/api/scrape", scrapeLimiter, async (req, res) => {
      const { url } = req.body as { url?: string };
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "Champ 'url' requis" });
        return;
      }
      try {
        const listing = await scrapeUrl(url);
        res.json(listing);
      } catch (e) {
        if (e instanceof ScrapeError) {
          res.status(422).json({ error: e.message });
        } else {
          const msg = e instanceof Error ? e.message : "Erreur inconnue";
          res.status(500).json({ error: msg });
        }
      }
    });
  }

  return app;
}

/** Réinitialise le store en mémoire depuis le fichier fixtures (tests uniquement). */
export function resetListingsStoreForTests(): void {
  listingsStore = loadListingsFromDisk();
}
