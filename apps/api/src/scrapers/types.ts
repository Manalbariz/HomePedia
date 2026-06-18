export interface ComparedListing {
  url: string;
  source: string;
  scrapedAt: string;
  // Essentiel
  title?: string;
  type?: "appartement" | "maison" | "studio" | "autre";
  price?: number;
  surface?: number;
  rooms?: number;
  bedrooms?: number;
  // Localisation
  address?: string;
  city?: string;
  postalCode?: string;
  lat?: number;
  lon?: number;
  // Immeuble
  floor?: string;
  elevator?: boolean;
  parking?: boolean;
  cellar?: boolean;
  // Logement
  balcony?: boolean;
  terrace?: boolean;
  furnished?: boolean;
  // Énergie
  dpe?: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  ges?: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  // Financier
  charges?: number;
  deposit?: number;
  fees?: number;
  // Media
  photos?: string[];
  description?: string;
  availableFrom?: string;
}
