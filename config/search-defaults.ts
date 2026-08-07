/**
 * Valeurs pré-remplies du formulaire de recherche.
 *
 * Le point de départ peut être une commune ou une **adresse précise** : le
 * rayon est alors centré dessus, ce qui change les prospects retenus. La
 * requête envoyée à Google reste formulée à la ville.
 *
 * En mode `MOCK_EXTERNAL=1`, seule Tours dispose d'un jeu de fixtures :
 * changer le point de départ ici n'a d'effet utile qu'en mode réel.
 */

export const DEFAULT_CITY = process.env.NEXT_PUBLIC_DEFAULT_CITY ?? "";
export const DEFAULT_RADIUS_M = 5000;

/**
 * Les rayons courts servent à travailler une rue ou un quartier : le coût d'un
 * balayage étant proportionnel au nombre de prospects retenus (un appel
 * Places « Enterprise » chacun), resserrer le rayon est le principal levier
 * d'économie.
 */
export const RADIUS_OPTIONS = [
  { value: 100, label: "100 m" },
  { value: 200, label: "200 m" },
  { value: 500, label: "500 m" },
  { value: 1000, label: "1 km" },
  { value: 2000, label: "2 km" },
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
  { value: 20000, label: "20 km" },
];

/** Rayon minimal accepté par l'API, aligné sur la plus petite option. */
export const MIN_RADIUS_M = 100;
export const MAX_RADIUS_M = 50_000;
