"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { TIER_COLOR, scoreTier } from "@/lib/scoring";
import type { ProspectSummary } from "@/lib/types";

/**
 * Carte des prospects.
 *
 * Deux précautions liées à Leaflet :
 *  - les marqueurs sont des `L.divIcon` en CSS pur, ce qui évite le bug
 *    classique des images d'icônes cassées par le bundler ;
 *  - `MapContainer` n'est jamais remonté : tout changement de centre passe
 *    par `useMap()` dans un composant enfant.
 *
 * Tuiles OSM France HOT : plus lisibles en ville dense que le fond CARTO
 * Positron, trop pâle quand beaucoup de pins se superposent.
 */

const FRANCE_CENTER: [number, number] = [46.6, 2.2];
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

declare global {
  interface Window {
    google?: {
      maps?: {
        Circle: new (options: Record<string, unknown>) => GoogleCircle;
        event: { removeListener: (listener: GoogleListener) => void };
        LatLngBounds: new () => GoogleBounds;
        Map: new (
          element: HTMLElement,
          options: Record<string, unknown>,
        ) => GoogleMapInstance;
        Marker: new (options: Record<string, unknown>) => GoogleMarker;
        SymbolPath: { CIRCLE: number };
      };
    };
    __opportunityGoogleMapsInit?: () => void;
    __opportunityGoogleMapsPromise?: Promise<void>;
  }
}

type GoogleListener = object;
type GoogleBounds = {
  extend: (point: { lat: number; lng: number }) => void;
};
type GoogleCircle = {
  getBounds: () => GoogleBounds | null;
  setMap: (map: GoogleMapInstance | null) => void;
};
type GoogleMapInstance = {
  fitBounds: (bounds: GoogleBounds, padding?: number) => void;
  panTo: (point: { lat: number; lng: number }) => void;
};
type GoogleMarker = {
  addListener: (event: string, handler: () => void) => GoogleListener;
  setMap: (map: GoogleMapInstance | null) => void;
};

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__opportunityGoogleMapsPromise) {
    return window.__opportunityGoogleMapsPromise;
  }

  window.__opportunityGoogleMapsPromise = new Promise((resolve, reject) => {
    window.__opportunityGoogleMapsInit = () => resolve();

    const script = document.createElement("script");
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(apiKey)}` +
      "&v=weekly&loading=async&callback=__opportunityGoogleMapsInit";
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Google Maps n'a pas chargé"));
    document.head.appendChild(script);
  });

  return window.__opportunityGoogleMapsPromise;
}

function pinIcon(prospect: ProspectSummary, selected: boolean): L.DivIcon {
  // Un prospect écarté n'a pas de score : pin neutre et barré.
  const color = prospect.optOut
    ? "#9ca3af"
    : prospect.score === null
      ? "#d1d5db"
      : TIER_COLOR[prospect.tier ?? scoreTier(prospect.score)];
  // SVG inline plutôt qu'un caractère : `⃠` est une marque combinante, elle ne
  // se rend pas de la même façon d'un système à l'autre.
  const label = prospect.optOut
    ? `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><path d="M3.8 3.8l8.4 8.4"/></svg>`
    : prospect.score === null
      ? "…"
      : String(prospect.score);

  return L.divIcon({
    className: "",
    html: `<div class="score-pin${selected ? " score-pin--selected" : ""}" style="background:${color}">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/** Petite croix indigo au centre du rayon. */
function centerIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: '<div class="search-center" title="Point de départ"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

/** Recentre la carte quand la zone de recherche change, sans la remonter. */
function ViewController({
  center,
  radiusM,
}: {
  center: { lat: number; lng: number } | null;
  radiusM: number | null;
}) {
  const map = useMap();
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!center) return;
    const key = `${center.lat},${center.lng},${radiusM}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    const bounds = L.latLng(center.lat, center.lng).toBounds(
      (radiusM ?? 5000) * 2,
    );
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [center, radiusM, map]);

  return null;
}

/** Amène le prospect sélectionné dans le champ de vision s'il en sort. */
function SelectionController({
  selected,
}: {
  selected: ProspectSummary | undefined;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selected) return;
    const point = L.latLng(selected.lat, selected.lng);
    if (!map.getBounds().pad(-0.1).contains(point)) {
      map.panTo(point, { animate: true });
    }
  }, [selected, map]);

  return null;
}

export function ResultsMap({
  center,
  radiusM,
  results,
  selectedId,
  onSelect,
}: {
  center: { lat: number; lng: number } | null;
  radiusM: number | null;
  results: ProspectSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const selected = useMemo(
    () => results.find((r) => r.id === selectedId),
    [results, selectedId],
  );

  if (GOOGLE_MAPS_API_KEY) {
    return (
      <GoogleResultsMap
        apiKey={GOOGLE_MAPS_API_KEY}
        center={center}
        radiusM={radiusM}
        results={results}
        selected={selected}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    );
  }

  return (
    <MapContainer
      center={FRANCE_CENTER}
      zoom={6}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, tiles &copy; <a href="https://www.openstreetmap.fr/">OSM France</a>'
        maxZoom={20}
      />

      <ViewController center={center} radiusM={radiusM} />
      <SelectionController selected={selected} />

      {center && radiusM && (
        <>
          <Circle
            center={[center.lat, center.lng]}
            radius={radiusM}
            pathOptions={{
              color: "#4f46e5",
              weight: 1,
              opacity: 0.4,
              fillOpacity: 0.03,
            }}
          />
          {/* Repère du point de départ : indispensable dès qu'on part d'une
              adresse précise plutôt que du centre-ville. */}
          <Marker
            position={[center.lat, center.lng]}
            icon={centerIcon()}
            interactive={false}
            zIndexOffset={-1000}
          />
        </>
      )}

      {results.map((prospect) => (
        <Marker
          key={prospect.id}
          position={[prospect.lat, prospect.lng]}
          icon={pinIcon(prospect, prospect.id === selectedId)}
          zIndexOffset={prospect.id === selectedId ? 1000 : 0}
          eventHandlers={{
            click: () => onSelect(prospect.id),
          }}
          title={
            prospect.optOut
              ? `${prospect.name} — écarté (${prospect.optOut})`
              : `${prospect.name} — ${prospect.score ?? "…"}/100`
          }
        />
      ))}
    </MapContainer>
  );
}

function GoogleResultsMap({
  apiKey,
  center,
  radiusM,
  results,
  selected,
  selectedId,
  onSelect,
}: {
  apiKey: string;
  center: { lat: number; lng: number } | null;
  radiusM: number | null;
  results: ProspectSummary[];
  selected: ProspectSummary | undefined;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const listenersRef = useRef<GoogleListener[]>([]);
  const circleRef = useRef<GoogleCircle | null>(null);
  const centerMarkerRef = useRef<GoogleMarker | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !hostRef.current || mapRef.current) return;
        const maps = window.google?.maps;
        if (!maps) throw new Error("Google Maps indisponible");
        mapRef.current = new maps.Map(hostRef.current, {
          center: center ?? { lat: FRANCE_CENTER[0], lng: FRANCE_CENTER[1] },
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          zoom: center ? 15 : 6,
        });
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, center]);

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    if (!mapReady || !maps || !map) return;

    for (const listener of listenersRef.current) {
      maps.event.removeListener(listener);
    }
    listenersRef.current = [];

    for (const marker of markersRef.current) marker.setMap(null);
    markersRef.current = [];
    centerMarkerRef.current?.setMap(null);
    circleRef.current?.setMap(null);

    if (center && radiusM) {
      circleRef.current = new maps.Circle({
        center,
        fillColor: "#4f46e5",
        fillOpacity: 0.05,
        map,
        radius: radiusM,
        strokeColor: "#4f46e5",
        strokeOpacity: 0.45,
        strokeWeight: 1,
      });

      centerMarkerRef.current = new maps.Marker({
        clickable: false,
        icon: {
          fillColor: "#ffffff",
          fillOpacity: 1,
          path: maps.SymbolPath.CIRCLE,
          scale: 5,
          strokeColor: "#4f46e5",
          strokeWeight: 3,
        },
        map,
        position: center,
        zIndex: 0,
      });

      const bounds = circleRef.current.getBounds();
      if (bounds) map.fitBounds(bounds, 32);
    }

    for (const prospect of results) {
      const selectedPin = prospect.id === selectedId;
      const marker = new maps.Marker({
        icon: {
          fillColor: pinColor(prospect),
          fillOpacity: 1,
          path: maps.SymbolPath.CIRCLE,
          scale: selectedPin ? 15 : 13,
          strokeColor: "#ffffff",
          strokeWeight: selectedPin ? 3 : 2,
        },
        label: {
          color: "#ffffff",
          fontSize: "11px",
          fontWeight: "700",
          text: pinLabel(prospect),
        },
        map,
        position: { lat: prospect.lat, lng: prospect.lng },
        title: prospect.optOut
          ? `${prospect.name} — écarté (${prospect.optOut})`
          : `${prospect.name} — ${prospect.score ?? "…"}/100`,
        zIndex: selectedPin ? 1000 : prospect.score ?? 1,
      });
      listenersRef.current.push(
        marker.addListener("click", () => onSelect(prospect.id)),
      );
      markersRef.current.push(marker);
    }
  }, [center, mapReady, onSelect, radiusM, results, selectedId]);

  useEffect(() => {
    if (!selected || !mapRef.current) return;
    mapRef.current.panTo({ lat: selected.lat, lng: selected.lng });
  }, [selected]);

  if (loadFailed) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-app-muted">
        Google Maps n&apos;a pas chargé. Vérifiez que Maps JavaScript API est
        activée sur la clé locale.
      </div>
    );
  }

  return <div ref={hostRef} className="h-full w-full" />;
}

function pinColor(prospect: ProspectSummary): string {
  if (prospect.optOut) return "#9ca3af";
  if (prospect.score === null) return "#d1d5db";
  return TIER_COLOR[prospect.tier ?? scoreTier(prospect.score)];
}

function pinLabel(prospect: ProspectSummary): string {
  if (prospect.optOut) return "!";
  if (prospect.score === null) return "…";
  return String(prospect.score);
}
