import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectMongo } from "../db.js";
import { Listing } from "../models/Listing.js";
import { MongoListingsRepository } from "./repository.js";
import type { ListingRecord } from "../types.js";
import { writeListingsSnapshot } from "../spark/similarIndex.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "../../data/listings.json");
const clearFirst = process.argv.includes("--clear");

async function seed() {
  await connectMongo();

  if (clearFirst) {
    const deleted = await Listing.deleteMany({});
    console.log(`[listings:seed] collection vidée (${deleted.deletedCount} doc(s))`);
  }

  const fixtures = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as ListingRecord[];
  const repo = new MongoListingsRepository();

  for (const listing of fixtures) {
    await repo.upsert(listing);
  }

  const all = await repo.getAll();
  writeListingsSnapshot(all);

  console.log(`[listings:seed] ${fixtures.length} annonce(s) upsert dans MongoDB`);
  console.log(`[listings:seed] snapshot Spark → ${all.length} annonce(s)`);
  console.log("[listings:seed] Passez LISTINGS_SOURCE=mongo dans .env puis redémarrez l'API");
}

seed().catch((err) => {
  console.error("[listings:seed] échec:", err);
  process.exit(1);
});
