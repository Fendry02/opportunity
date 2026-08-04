/** Formatages partagés entre l'UI et le brief. */

/** 780 → « 780 m » · 2637 → « 2,6 km ». */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

/** Rayon d'une recherche, lisible aussi bien à 100 m qu'à 20 km. */
export function formatRadius(meters: number): string {
  return formatDistance(meters);
}
