"use client";

import {
  type GeoJSONSource,
  MapLibreMap,
  Marker,
  NavigationControl,
} from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { circleBounds, circlePolygon } from "@/lib/map/circle";
import { loadMapStyle } from "@/lib/map/style";
import { TIER_COLOR, scoreTier } from "@/lib/scoring";
import type { ProspectSummary } from "@/lib/types";

/**
 * Carte des prospects, sur fond vectoriel OpenFreeMap Positron.
 *
 * Le fond est gris neutre par choix : les pins de score sont rouges et
 * orangés, et l'ancien fond OSM HOT avait des routes saumon de la même famille
 * chromatique — les pastilles s'y noyaient dès qu'un balayage était dense.
 *
 * Deux précautions liées à MapLibre :
 *  - les marqueurs sont des éléments DOM en CSS pur, ce qui évite les icônes
 *    cassées par le bundler et permet de réutiliser `.score-pin` tel quel ;
 *  - la carte n'est créée qu'une fois : tout changement de cadrage passe par
 *    l'instance conservée dans `mapRef`, jamais par un remontage.
 *
 * `maplibre-gl` est épinglé en ^5 volontairement. En 6.2.0, la carte se crée
 * sans erreur — canvas, contrôles et style chargés, source résolue — puis ne
 * demande jamais une seule tuile et n'émet aucun événement `error` : écran
 * blanc silencieux. Vérifié aussi hors React, avec le style amont non modifié,
 * en dev comme en build de production. Ne remonter en 6 qu'après avoir
 * constaté des tuiles qui s'affichent.
 */

const FRANCE_CENTER: [number, number] = [2.2, 46.6];
const FRANCE_ZOOM = 5;

/** Marge intérieure du recadrage, en pixels. */
const FIT_PADDING = 24;

/**
 * Fraction de la vue conservée pour juger qu'un prospect est « visible ».
 * Un pin collé au bord est techniquement dans le cadre mais illisible : on
 * recentre quand même. Reprend le `pad(-0.1)` de l'implémentation Leaflet.
 */
const VISIBLE_INSET = 0.1;

function pinColor(prospect: ProspectSummary): string {
  if (prospect.optOut) return "#9ca3af";
  if (prospect.score === null) return "#d1d5db";
  return TIER_COLOR[prospect.tier ?? scoreTier(prospect.score)];
}

function pinLabel(prospect: ProspectSummary): string {
  // SVG inline plutôt qu'un caractère : `⃠` est une marque combinante, elle ne
  // se rend pas de la même façon d'un système à l'autre.
  if (prospect.optOut) {
    return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><path d="M3.8 3.8l8.4 8.4"/></svg>';
  }
  return prospect.score === null ? "…" : String(prospect.score);
}

function pinTitle(prospect: ProspectSummary): string {
  return prospect.optOut
    ? `${prospect.name} — écarté (${prospect.optOut})`
    : `${prospect.name} — ${prospect.score ?? "…"}/100`;
}

function createPinElement(
  prospect: ProspectSummary,
  selected: boolean,
): HTMLElement {
  const el = document.createElement("div");
  el.className = `score-pin${selected ? " score-pin--selected" : ""}`;
  el.style.background = pinColor(prospect);
  el.style.cursor = "pointer";
  el.title = pinTitle(prospect);
  el.innerHTML = pinLabel(prospect);
  return el;
}

/** Repère discret du point de départ, jamais confondu avec un prospect. */
function createCenterElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "search-center";
  el.title = "Point de départ";
  return el;
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
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const centerMarkerRef = useRef<Marker | null>(null);
  const lastViewKey = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const selected = useMemo(
    () => results.find((r) => r.id === selectedId),
    [results, selectedId],
  );

  // Le parent reconstruit `center` à chaque rendu (`{ lat, lng }` littéral),
  // donc son identité change sans arrêt. On dépend des primitives pour que les
  // effets ne se rejouent que sur un vrai déplacement de la zone.
  const centerLat = center?.lat ?? null;
  const centerLng = center?.lng ?? null;

  // `onSelect` change d'identité à chaque rendu du parent. Le garder dans une
  // ref évite de reconstruire tous les marqueurs pour ça.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Création de la carte. Volontairement sans dépendances : elle ne doit
  // exister qu'une fois pour toute la vie du composant.
  useEffect(() => {
    const host = hostRef.current;
    // La garde `mapRef.current` est indispensable : sans elle, le double
    // montage du mode strict crée deux cartes sur le même conteneur.
    if (!host || mapRef.current) return;

    const abort = new AbortController();
    let cancelled = false;

    /**
     * MapLibre lit la taille du conteneur à la construction. Créée sur un div
     * encore à zéro — ce qui arrive, la carte étant construite après un `await`
     * dans un conteneur flex —, la carte ne couvre aucune tuile, ne peint
     * jamais et n'émet donc jamais `load` : écran blanc définitif, sans erreur.
     * On attend une taille réelle avant de construire.
     */
    function whenSized(el: HTMLElement): Promise<void> {
      if (el.clientWidth > 0 && el.clientHeight > 0) return Promise.resolve();
      return new Promise((resolve) => {
        const observer = new ResizeObserver(() => {
          if (el.clientWidth > 0 && el.clientHeight > 0) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(el);
        abort.signal.addEventListener("abort", () => {
          observer.disconnect();
          resolve();
        });
      });
    }
    // Référence locale : en mode strict, React monte, démonte puis remonte. Le
    // nettoyage doit détruire la carte que *ce* passage a créée, et ne remettre
    // `mapRef` à zéro que si elle y est encore. Utiliser `mapRef` directement
    // fait annuler par un passage la carte vivante d'un autre — c'est ce qui
    // rendait le chargement aléatoire.
    let created: MapLibreMap | null = null;

    void Promise.all([loadMapStyle(abort.signal), whenSized(host)])
      .then(([style]) => {
        if (cancelled || !hostRef.current) return;
        const map = new MapLibreMap({
          container: hostRef.current,
          style,
          center: FRANCE_CENTER,
          zoom: FRANCE_ZOOM,
          attributionControl: { compact: true },
        });
        created = map;
        mapRef.current = map;
        map.addControl(new NavigationControl({ showCompass: false }), "top-left");

        map.on("error", (event) => {
          // Une tuile manquante ne doit pas vider l'écran, mais sans cette
          // trace une panne du fond laisse un cadre blanc inexplicable.
          console.error("[carte]", event.error?.message ?? event);
        });

        // `load` a pu partir avant qu'on s'y abonne : tester l'état d'abord,
        // sinon `ready` reste faux et plus rien ne se dessine.
        if (map.loaded()) {
          setReady(true);
        } else {
          map.once("load", () => {
            if (!cancelled) setReady(true);
          });
        }
      })
      .catch((err: unknown) => {
        // `AbortError` au démontage n'est pas une panne : ne pas afficher
        // d'erreur pour un composant qui n'existe plus.
        if (cancelled || (err instanceof Error && err.name === "AbortError")) {
          return;
        }
        setFailed(true);
      });

    return () => {
      cancelled = true;
      abort.abort();
      created?.remove();
      if (mapRef.current === created) mapRef.current = null;
      // La carte détruite, tout ce qu'on y avait ajouté est parti avec elle.
      markersRef.current = [];
      centerMarkerRef.current = null;
      lastViewKey.current = null;
    };
  }, []);

  // Cercle de rayon et repère du centre.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const center =
      centerLat === null || centerLng === null
        ? null
        : { lat: centerLat, lng: centerLng };

    const source = map.getSource("search-radius") as
      | GeoJSONSource
      | undefined;

    if (!center || !radiusM) {
      centerMarkerRef.current?.remove();
      centerMarkerRef.current = null;
      // Vider la source plutôt que retirer les couches : moins d'états
      // possibles à raisonner au prochain balayage.
      source?.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const polygon = circlePolygon(center, radiusM);

    if (source) {
      source.setData(polygon);
    } else {
      map.addSource("search-radius", { type: "geojson", data: polygon });
      map.addLayer({
        id: "search-radius-fill",
        type: "fill",
        source: "search-radius",
        paint: { "fill-color": "#4f46e5", "fill-opacity": 0.03 },
      });
      map.addLayer({
        id: "search-radius-line",
        type: "line",
        source: "search-radius",
        // 0.7 et non 0.4 comme du temps de Leaflet : sur le gris pâle de
        // Positron, le trait d'origine était à peine perceptible.
        paint: {
          "line-color": "#4f46e5",
          "line-width": 1,
          "line-opacity": 0.7,
        },
      });
    }

    if (!centerMarkerRef.current) {
      centerMarkerRef.current = new Marker({
        element: createCenterElement(),
        anchor: "center",
      }).setLngLat([center.lng, center.lat]);
      centerMarkerRef.current.addTo(map);
    } else {
      centerMarkerRef.current.setLngLat([center.lng, center.lat]);
    }
  }, [centerLat, centerLng, radiusM, ready]);

  // Recadrage quand la zone de recherche change. La garde évite de recadrer —
  // et donc d'annuler la navigation manuelle de l'utilisateur — quand ni le
  // centre ni le rayon n'ont bougé.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || centerLat === null || centerLng === null || !radiusM) {
      return;
    }
    const center = { lat: centerLat, lng: centerLng };

    const key = `${center.lat},${center.lng},${radiusM}`;
    if (lastViewKey.current === key) return;
    lastViewKey.current = key;

    map.fitBounds(circleBounds(center, radiusM), { padding: FIT_PADDING });
  }, [centerLat, centerLng, radiusM, ready]);

  // Marqueurs de prospects.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    for (const prospect of results) {
      const isSelected = prospect.id === selectedId;
      const element = createPinElement(prospect, isSelected);
      element.addEventListener("click", (event) => {
        // Sans ça, MapLibre traite aussi le clic comme un clic sur la carte.
        event.stopPropagation();
        onSelectRef.current(prospect.id);
      });
      // Le pin sélectionné doit passer devant ses voisins qui se chevauchent.
      element.style.zIndex = isSelected ? "1000" : String(prospect.score ?? 1);

      const marker = new Marker({ element, anchor: "center" })
        .setLngLat([prospect.lng, prospect.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [ready, results, selectedId]);

  // Amène le prospect sélectionné dans le champ de vision s'il en sort.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selected) return;

    const bounds = map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const insetLng = (east - west) * VISIBLE_INSET;
    const insetLat = (north - south) * VISIBLE_INSET;

    const visible =
      selected.lng > west + insetLng &&
      selected.lng < east - insetLng &&
      selected.lat > south + insetLat &&
      selected.lat < north - insetLat;

    if (!visible) map.panTo([selected.lng, selected.lat]);
  }, [ready, selected]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-app-muted">
        Le fond de carte n&apos;a pas chargé. Vérifiez votre connexion : les
        tuiles viennent d&apos;OpenFreeMap.
      </div>
    );
  }

  return <div ref={hostRef} className="h-full w-full" />;
}
