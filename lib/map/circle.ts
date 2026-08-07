/**
 * Cercle de rayon de recherche, en GeoJSON.
 *
 * Leaflet fournissait `L.Circle` ; MapLibre n'a pas d'équivalent et ne dessine
 * que des sources. Le cercle devient donc un polygone échantillonné.
 *
 * Fonction pure, sans dépendance : c'est ce qui la rend testable sous
 * `node:test` sans DOM ni moteur de rendu.
 */

/** Mètres par degré de latitude. Constant à la précision qui nous intéresse. */
const M_PER_DEG_LAT = 111_320;

/**
 * Empêche la division par zéro aux pôles, où `cos(latitude)` tend vers 0.
 * Hors sujet pour la France, mais un NaN silencieux ferait disparaître le
 * cercle sans message d'erreur — on préfère un cercle très large et visible.
 */
const MIN_COS_LAT = 1e-6;

export type LatLng = { lat: number; lng: number };

export type CirclePolygon = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: {
    type: "Polygon";
    /** Un seul anneau, fermé : le dernier point répète le premier. */
    coordinates: [number, number][][];
  };
};

/**
 * Approxime un cercle géodésique par un polygone de `steps` segments.
 *
 * 96 segments suffisent : au rayon maximal proposé dans l'interface, l'écart
 * entre le polygone et le cercle réel reste sous le pixel.
 */
export function circlePolygon(
  center: LatLng,
  radiusM: number,
  steps = 96,
): CirclePolygon {
  const latRad = (center.lat * Math.PI) / 180;
  // Sans cette correction le cercle s'aplatit visiblement : à la latitude de
  // la France, un degré de longitude vaut environ deux tiers d'un degré de
  // latitude en distance.
  const cosLat = Math.max(Math.abs(Math.cos(latRad)), MIN_COS_LAT);

  const dLat = radiusM / M_PER_DEG_LAT;
  const dLng = radiusM / (M_PER_DEG_LAT * cosLat);

  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([
      center.lng + dLng * Math.sin(angle),
      center.lat + dLat * Math.cos(angle),
    ]);
  }
  // Fermeture explicite plutôt que `i <= steps` : le dernier point doit être
  // le premier au bit près, pas son recalcul trigonométrique.
  ring.push(ring[0]);

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

/**
 * Boîte englobante du cercle, au format attendu par `fitBounds`.
 *
 * Calculée depuis les mêmes deltas que le polygone : le cadrage encadre donc
 * exactement ce qui est dessiné, sans dérive entre les deux.
 */
export function circleBounds(
  center: LatLng,
  radiusM: number,
): [[number, number], [number, number]] {
  const latRad = (center.lat * Math.PI) / 180;
  const cosLat = Math.max(Math.abs(Math.cos(latRad)), MIN_COS_LAT);
  const dLat = radiusM / M_PER_DEG_LAT;
  const dLng = radiusM / (M_PER_DEG_LAT * cosLat);

  return [
    [center.lng - dLng, center.lat - dLat],
    [center.lng + dLng, center.lat + dLat],
  ];
}
