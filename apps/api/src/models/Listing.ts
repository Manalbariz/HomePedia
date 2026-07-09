import { Schema, model } from "mongoose";
import type { ListingRecord } from "../types.js";

const listingSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    address: { type: String, required: true },
    price: { type: Number, required: true, index: true },
    rooms: { type: Number, required: true },
    surface: { type: Number, required: true },
    floor: { type: String, required: true, default: "—" },
    tags: { type: [String], default: [] },
    score: { type: Number, required: true, default: 75 },
    imageUrl: { type: String, required: true },
    lat: { type: Number, required: true, index: true },
    lon: { type: Number, required: true, index: true },
    source: { type: String, required: true, index: true },
    url: { type: String, required: true, unique: true },
  },
  { timestamps: true, versionKey: false },
);

listingSchema.index({ lat: 1, lon: 1 });

export function docToListingRecord(doc: {
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
}): ListingRecord {
  return {
    id: doc.id,
    title: doc.title,
    address: doc.address,
    price: doc.price,
    rooms: doc.rooms,
    surface: doc.surface,
    floor: doc.floor,
    tags: doc.tags,
    score: doc.score,
    imageUrl: doc.imageUrl,
    lat: doc.lat,
    lon: doc.lon,
    source: doc.source,
    url: doc.url,
  };
}

export const Listing = model("Listing", listingSchema);
