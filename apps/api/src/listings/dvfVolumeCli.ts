import "dotenv/config";
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectMongo } from "../db.js";
import { MongoListingsRepository } from "./repository.js";
import { buildRawListingEvent } from "../kafka/rawEvents.js";
import { publishRawListingEvent } from "../kafka/producer.js";
import { getKafkaConfig } from "../kafka/config.js";
import { toListingRecord } from "../preprocess/toListingRecord.js";
import type { ComparedListing } from "../scrapers/types.js";
import { writeListingsSnapshot } from "../spark/similarIndex.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DVF_PATH = join(__dirname, "../../../../data/raw/dvf/dvf_stats_whole_period.csv");

const VARIANTS = [
  { rooms: 1, surface: 28, suffix: "studio" },
  { rooms: 2, surface: 48, suffix: "t2" },
  { rooms: 3, surface: 68, suffix: "t3" },
] as const;

function parseLimit(): number {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  if (limitArg) {
    const n = Number(limitArg.split("=")[1]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }

  const fromEnv = Number(process.env.DVF_LIMIT ?? process.env.npm_config_limit ?? "");
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);

  return 1000;
}

const limit = parseLimit();
const useKafka = process.argv.includes("--kafka");

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function monthlyRentProxy(priceM2: number, surface: number): number {
  return Math.max(400, Math.round((priceM2 * surface) / 180));
}

async function loadDvfCommunes(): Promise<
  Array<{ code: string; label: string; priceM2: number }>
> {
  if (!existsSync(DVF_PATH)) {
    throw new Error(
      `Fichier DVF introuvable: ${DVF_PATH}\n` +
        "Placez dvf_stats_whole_period.csv sous data/raw/dvf/ ou lancez legacy/pipelines (voir docs/01-inventaire-donnees.md)",
    );
  }

  const rl = createInterface({ input: createReadStream(DVF_PATH, "utf-8") });
  let headers: string[] | null = null;
  const rows: Array<{ code: string; label: string; priceM2: number }> = [];

  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line);
      continue;
    }
    const cols = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));
    if (row.echelle_geo !== "commune") continue;

    const priceM2 = Number(row.med_prix_m2_whole_appartement);
    if (!Number.isFinite(priceM2) || priceM2 <= 0) continue;

    rows.push({
      code: row.code_geo ?? "",
      label: row.libelle_geo ?? row.code_geo ?? "Commune",
      priceM2,
    });
    if (rows.length >= limit) break;
  }

  return rows;
}

function communeToCompared(
  commune: { code: string; label: string; priceM2: number },
  variant: (typeof VARIANTS)[number],
): ComparedListing {
  const url = `https://dvf.data.gouv.fr/commune/${commune.code}/${variant.suffix}`;
  return {
    url,
    source: "dvf",
    scrapedAt: new Date().toISOString(),
    title: `${variant.rooms === 1 ? "Studio" : `T${variant.rooms}`} — ${commune.label}`,
    price: monthlyRentProxy(commune.priceM2, variant.surface),
    rooms: variant.rooms,
    surface: variant.surface,
    city: commune.label,
    postalCode: commune.code.length === 5 ? commune.code : undefined,
    address: `${commune.code} · ${commune.label}`,
    type: variant.rooms === 1 ? "studio" : "appartement",
  };
}

async function main() {
  console.log(`[dvf-volume] limite=${limit} commune(s), kafka=${useKafka ? "oui" : "non"}`);

  const communes = await loadDvfCommunes();
  console.log(`[dvf-volume] ${communes.length} commune(s) DVF chargée(s)`);

  await connectMongo();
  const repo = new MongoListingsRepository();
  const kafkaOn = useKafka && getKafkaConfig().enabled;

  let upserted = 0;
  let skipped = 0;

  for (const commune of communes) {
    for (const variant of VARIANTS) {
      const compared = communeToCompared(commune, variant);
      try {
        if (kafkaOn) {
          await publishRawListingEvent(buildRawListingEvent(compared, "batch"));
        } else {
          const listing = toListingRecord(compared);
          listing.tags = [...listing.tags, "DVF", "Marché local"];
          listing.source = "dvf";
          await repo.upsert(listing);
        }
        upserted++;
      } catch (err) {
        skipped++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[dvf-volume] skip ${commune.code}: ${msg}`);
      }
    }
  }

  if (!kafkaOn) {
    writeListingsSnapshot(await repo.getAll());
  }

  console.log(
    `[dvf-volume] ${upserted} enregistrement(s) ${kafkaOn ? "publié(s) sur Kafka raw" : "upsert en MongoDB"}` +
      (skipped > 0 ? `, ${skipped} ignoré(s)` : ""),
  );
}

main().catch((err) => {
  console.error("[dvf-volume] échec:", err);
  process.exit(1);
});
