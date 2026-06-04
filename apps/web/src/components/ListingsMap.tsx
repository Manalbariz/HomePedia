import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { useTheme, type Theme } from "@/context/ThemeContext";
import type { Listing } from "@/types/listing";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

const TILES: Record<Theme, { url: string; attribution: string }> = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  light: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
};

const FRANCE_CENTER: [number, number] = [46.6, 2.4];
const DEFAULT_ZOOM = 6;

function priceIcon(
  price: number,
  active: boolean,
  theme: Theme,
  similar = false,
) {
  const inactiveBg = theme === "light" ? "#ffffff" : "#0E1428";
  const inactiveText = theme === "light" ? "#0E1428" : "#ffffff";
  const bg = similar ? "#4F58E8" : active ? "#FF4B5C" : inactiveBg;
  const border = active ? "#fff" : similar ? "#6B7AFF" : "#FF4B5C";
  const color = similar || active ? "#fff" : inactiveText;
  const label = Math.round(price / 100);

  return L.divIcon({
    className: "listing-marker",
    html: `<div style="
      width:32px;height:32px;border-radius:50%;
      background:${bg};border:2px solid ${border};color:${color};
      font:700 10px/28px 'DM Mono',monospace;
      text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.25);
      ${active ? "transform:scale(1.15);" : ""}
    ">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function MapViewport({
  listings,
  selectedId,
}: {
  listings: Listing[];
  selectedId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedId) {
      const hit = listings.find((l) => l.id === selectedId);
      if (hit) {
        map.setView([hit.lat, hit.lon], 14, { animate: true });
        return;
      }
    }
    if (listings.length === 0) return;
    if (listings.length === 1) {
      const only = listings[0]!;
      map.setView([only.lat, only.lon], 12, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(listings.map((l) => [l.lat, l.lon]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12, animate: true });
  }, [listings, selectedId, map]);

  return null;
}

export interface ListingsMapProps {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  similarListings?: Listing[];
  className?: string;
  interactive?: boolean;
}

export function ListingsMap({
  listings,
  selectedId,
  onSelect,
  similarListings = [],
  className = "absolute inset-0 z-0",
  interactive = true,
}: ListingsMapProps) {
  const { theme } = useTheme();
  const tile = TILES[theme];

  const similarIds = useMemo(
    () => new Set(similarListings.map((l) => l.id)),
    [similarListings],
  );

  const mainListings = useMemo(
    () => listings.filter((l) => !similarIds.has(l.id)),
    [listings, similarIds],
  );

  return (
    <div className={className}>
      <MapContainer
        center={FRANCE_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full rounded-none"
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        zoomControl={interactive}
      >
        <TileLayer key={theme} attribution={tile.attribution} url={tile.url} />
        <MapViewport listings={[...mainListings, ...similarListings]} selectedId={selectedId} />

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={50}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
        >
          {mainListings.map((l) => (
            <Marker
              key={l.id}
              position={[l.lat, l.lon]}
              icon={priceIcon(l.price, selectedId === l.id, theme)}
              eventHandlers={{
                click: () => onSelect(l.id),
              }}
            >
              <Popup>
                <ListingPopup listing={l} />
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>

        {similarListings.map((l) => (
          <Marker
            key={`sim-${l.id}`}
            position={[l.lat, l.lon]}
            icon={priceIcon(l.price, selectedId === l.id, theme, true)}
            eventHandlers={{ click: () => onSelect(l.id) }}
          >
            <Popup>
              <ListingPopup listing={l} similar />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function ListingPopup({
  listing,
  similar,
}: {
  listing: Listing;
  similar?: boolean;
}) {
  return (
    <div className="min-w-[180px] text-sm text-gray-900">
      {similar && (
        <span className="text-[10px] font-semibold text-indigo-600 uppercase">
          Similaire
        </span>
      )}
      <div className="font-semibold">{listing.title}</div>
      <div className="text-xs text-gray-600">{listing.address}</div>
      <div className="font-bold text-rose-600 mt-1">
        {listing.price.toLocaleString("fr-FR")} €/mois
      </div>
      <a
        href={listing.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-indigo-600 underline mt-1 inline-block"
      >
        Voir l&apos;annonce →
      </a>
    </div>
  );
}
