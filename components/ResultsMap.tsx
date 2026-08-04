"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
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
 * Tuiles CARTO Positron : claires et désaturées, pour que seuls les pins
 * colorés ressortent.
 */

const FRANCE_CENTER: [number, number] = [46.6, 2.2];

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
  onOpen,
}: {
  center: { lat: number; lng: number } | null;
  radiusM: number | null;
  results: ProspectSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Clic sur un pin : ouvre la fiche dans le panneau latéral. */
  onOpen: (id: string) => void;
}) {
  const selected = useMemo(
    () => results.find((r) => r.id === selectedId),
    [results, selectedId],
  );

  return (
    <MapContainer
      center={FRANCE_CENTER}
      zoom={6}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
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
            // Survol : surbrillance dans la liste. Clic : ouverture de la fiche.
            mouseover: () => onSelect(prospect.id),
            click: () => {
              onSelect(prospect.id);
              onOpen(prospect.id);
            },
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
