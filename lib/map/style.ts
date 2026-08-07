/**
 * Ajustement du style OpenFreeMap Positron.
 *
 * Positron brut a deux défauts sous nos pins de score : les libellés de
 * quartier en capitales (`label_other`) et le nom de la ville (`label_city`)
 * passent sous les pastilles au zoom d'un balayage, et la voirie est trop
 * délavée pour qu'on suive une rue derrière un amas de pins.
 *
 * On patche plutôt qu'on ne vendorise le style : embarquer les 25 Ko de JSON
 * figerait le rendu et obligerait à suivre à la main les corrections
 * d'OpenFreeMap. En contrepartie, un identifiant de couche renommé chez eux
 * rend l'override correspondant inopérant — c'est le mode de défaillance
 * choisi : on perd un réglage esthétique, jamais la carte.
 */

import type { StyleSpecification } from "maplibre-gl";

/** URL du style amont. Sans clé d'API, sans quota. */
export const POSITRON_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * Zoom à partir duquel on considère être « dans » un balayage : les libellés
 * de contexte deviennent alors du bruit, l'utilisateur sait quelle ville il
 * regarde puisqu'il vient de la saisir.
 */
const SWEEP_ZOOM = 14;
const CONTEXT_ZOOM = 12;

type PaintOverride = { id: string; paint: Record<string, unknown> };

const OVERRIDES: PaintOverride[] = [
  {
    // Libellés de quartier en capitales. Les plus gênants : ils sont larges,
    // gris foncé, et tombent en plein sur les amas de pins.
    id: "label_other",
    paint: {
      "text-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        CONTEXT_ZOOM,
        1,
        SWEEP_ZOOM,
        0.35,
      ],
    },
  },
  {
    // Nom de la ville, en noir pur et au centre de la zone balayée.
    id: "label_city",
    paint: {
      "text-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        CONTEXT_ZOOM,
        1,
        SWEEP_ZOOM,
        0,
      ],
    },
  },
  {
    // Voirie secondaire : remontée juste assez pour rester suivable sous les
    // pastilles. Au-delà, elle se met à leur faire concurrence et on
    // reproduit le défaut du fond HOT qu'on quitte.
    id: "highway_minor",
    paint: { "line-color": "hsl(0,0%,82%)", "line-opacity": 1 },
  },
  {
    id: "highway_major_casing",
    paint: { "line-color": "rgb(198,198,198)" },
  },
];

/**
 * Applique les overrides à un style Positron.
 *
 * Ne mute pas l'entrée et ne lève jamais : une couche absente est simplement
 * ignorée.
 */
export function patchPositronStyle(
  style: StyleSpecification,
): StyleSpecification {
  const byId = new Map(OVERRIDES.map((o) => [o.id, o]));

  return {
    ...style,
    layers: style.layers.map((layer) => {
      const override = byId.get(layer.id);
      if (!override) return layer;
      const paint = {
        ...((layer as { paint?: Record<string, unknown> }).paint ?? {}),
        ...override.paint,
      };
      return { ...layer, paint } as typeof layer;
    }),
  };
}

/** Identifiants attendus en amont, exposés pour que les tests les vérifient. */
export const OVERRIDDEN_LAYER_IDS = OVERRIDES.map((o) => o.id);

/**
 * Récupère le style amont et l'ajuste.
 *
 * Laisse remonter l'échec réseau : sans style, il n'y a pas de carte à
 * afficher, et l'appelant doit pouvoir le dire à l'utilisateur plutôt que de
 * laisser un cadre vide.
 */
export async function loadMapStyle(
  signal?: AbortSignal,
): Promise<StyleSpecification> {
  const res = await fetch(POSITRON_STYLE_URL, { signal });
  if (!res.ok) {
    throw new Error(`Style de carte indisponible (HTTP ${res.status})`);
  }
  return patchPositronStyle((await res.json()) as StyleSpecification);
}
