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
