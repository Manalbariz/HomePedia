import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { filterListings, paginateListings } from "../filters.js";
import type { ListingFilters, ListingPagination, PaginatedListings } from "../filters.js";
import { Listing, docToListingRecord } from "../models/Listing.js";
import type { ListingRecord } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "../../data/listings.json");

export interface ListingsRepository {
  getAll(): Promise<ListingRecord[]>;
  findById(id: string): Promise<ListingRecord | null>;
  findFiltered(
    filters: ListingFilters,
    pagination?: ListingPagination,
  ): Promise<PaginatedListings<ListingRecord>>;
  upsert(listing: ListingRecord): Promise<ListingRecord>;
  count(): Promise<number>;
}

export class MemoryListingsRepository implements ListingsRepository {
  private store: ListingRecord[];

  constructor(initial?: ListingRecord[]) {
    this.store = initial ?? this.loadFromDisk();
  }

  private loadFromDisk(): ListingRecord[] {
    const raw = readFileSync(DATA_PATH, "utf-8");
    return JSON.parse(raw) as ListingRecord[];
  }

  async getAll(): Promise<ListingRecord[]> {
    return [...this.store];
  }

  async findById(id: string): Promise<ListingRecord | null> {
    return this.store.find((l) => l.id === id) ?? null;
  }

  async findFiltered(
    filters: ListingFilters,
    pagination: ListingPagination = { offset: 0 },
  ): Promise<PaginatedListings<ListingRecord>> {
    const filtered = filterListings(this.store, filters);
    return paginateListings(filtered, pagination);
  }

  async upsert(listing: ListingRecord): Promise<ListingRecord> {
    const idx = this.store.findIndex((l) => l.id === listing.id || l.url === listing.url);
    if (idx >= 0) {
      this.store[idx] = listing;
    } else {
      this.store.push(listing);
    }
    return listing;
  }

  async count(): Promise<number> {
    return this.store.length;
  }

  resetFromDisk(): void {
    this.store = this.loadFromDisk();
  }
}

export class MongoListingsRepository implements ListingsRepository {
  async getAll(): Promise<ListingRecord[]> {
    const docs = await Listing.find().lean();
    return docs.map((d) => docToListingRecord(d));
  }

  async findById(id: string): Promise<ListingRecord | null> {
    const doc = await Listing.findOne({ id }).lean();
    return doc ? docToListingRecord(doc) : null;
  }

  async findFiltered(
    filters: ListingFilters,
    pagination: ListingPagination = { offset: 0 },
  ): Promise<PaginatedListings<ListingRecord>> {
    const mongoQuery: Record<string, unknown> = {};
    if (filters.source) mongoQuery.source = filters.source;
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const price: Record<string, number> = {};
      if (filters.minPrice !== undefined) price.$gte = filters.minPrice;
      if (filters.maxPrice !== undefined) price.$lte = filters.maxPrice;
      mongoQuery.price = price;
    }
    if (filters.minRooms !== undefined) mongoQuery.rooms = { $gte: filters.minRooms };

    const docs = await Listing.find(mongoQuery).lean();
    const filtered = filterListings(docs.map((d) => docToListingRecord(d)), filters);
    return paginateListings(filtered, pagination);
  }

  async upsert(listing: ListingRecord): Promise<ListingRecord> {
    await Listing.findOneAndUpdate(
      { $or: [{ id: listing.id }, { url: listing.url }] },
      { $set: listing },
      { upsert: true, new: true },
    );
    return listing;
  }

  async count(): Promise<number> {
    return Listing.countDocuments();
  }
}

let repository: ListingsRepository = new MemoryListingsRepository();

export function getListingsRepository(): ListingsRepository {
  return repository;
}

export function setListingsRepository(repo: ListingsRepository): void {
  repository = repo;
}

export function isMongoListingsSource(): boolean {
  const flag = (process.env.LISTINGS_SOURCE ?? "mock").trim().toLowerCase();
  return flag === "mongo";
}

export function createListingsRepository(): ListingsRepository {
  if (isMongoListingsSource()) {
    return new MongoListingsRepository();
  }
  return new MemoryListingsRepository();
}

/** Réinitialise le store mémoire depuis fixtures (tests). */
export function resetListingsStoreForTests(): void {
  const repo = getListingsRepository();
  if (repo instanceof MemoryListingsRepository) {
    repo.resetFromDisk();
  }
}
