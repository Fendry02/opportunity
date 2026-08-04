/**
 * Détection des refus de démarchage.
 *
 * Certaines entreprises signalent explicitement, dans leur fiche Google,
 * qu'elles ne veulent pas être sollicitées pour un site web — souvent via un
 * faux nom de domaine (`pasdedemarchagepourunsite.com`) ou une mention dans
 * le nom de l'établissement.
 *
 * Sans ce filtre, l'outil les remonterait en tête : le domaine ne résout pas,
 * donc « site mort », donc score très élevé. C'est exactement l'inverse de ce
 * qu'il faut faire. Ces prospects sont écartés du balayage — aucun appel
 * facturé de plus, aucune analyse, aucun score — et affichés comme tels.
 */

/** Marqueurs cherchés dans la forme normalisée (sans accents ni séparateurs). */
const OPT_OUT_MARKERS: [string, string][] = [
  ["pasdedemarchage", "pas de démarchage"],
  ["sansdemarchage", "sans démarchage"],
  ["stopdemarchage", "stop démarchage"],
  ["nondemarchage", "non au démarchage"],
  ["nepasdemarcher", "ne pas démarcher"],
  ["nedemarchezpas", "ne démarchez pas"],
  ["nesollicitezpas", "ne sollicitez pas"],
  ["pasdesollicitation", "pas de sollicitation"],
  ["refusdedemarchage", "refus de démarchage"],
  ["pasdepublicite", "pas de publicité"],
  ["pasdepub", "pas de pub"],
  ["stoppub", "stop pub"],
  ["pasdesiteweb", "pas de site web"],
  ["pasdesiteinternet", "pas de site internet"],
  ["jeneveuxpasdesite", "je ne veux pas de site"],
  ["pasinteresseparunsite", "pas intéressé par un site"],
  ["donotcall", "do not call"],
  ["nocoldcalling", "no cold calling"],
];

export type OptOut = {
  /** Formulation lisible du marqueur, pour l'afficher tel quel. */
  marker: string;
  /** D'où vient le signal — utile pour justifier l'exclusion. */
  source: "nom" | "site";
};

/** Réduit à une suite de lettres et chiffres : « Pas-de-Démarchage ! » → « pasdedemarchage ». */
function flatten(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findMarker(value: string | null | undefined): string | null {
  if (!value) return null;
  const flat = flatten(value);
  // Les marqueurs sont des expressions entières : le risque de faux positif
  // sur un nom d'entreprise ordinaire est négligeable.
  return OPT_OUT_MARKERS.find(([needle]) => flat.includes(needle))?.[1] ?? null;
}

/**
 * Le nom est disponible dès la recherche (SKU Pro) : détecter là évite de
 * payer l'appel de détails pour un prospect qu'on va écarter.
 */
export function detectOptOutInName(name: string): OptOut | null {
  const marker = findMarker(name);
  return marker ? { marker, source: "nom" } : null;
}

/** L'URL n'arrive qu'avec les détails (SKU Enterprise). */
export function detectOptOutInWebsite(websiteUrl: string | null): OptOut | null {
  const marker = findMarker(websiteUrl);
  return marker ? { marker, source: "site" } : null;
}

export function detectOptOut(input: {
  name: string;
  websiteUrl?: string | null;
}): OptOut | null {
  return (
    detectOptOutInName(input.name) ??
    detectOptOutInWebsite(input.websiteUrl ?? null)
  );
}

/** Phrase affichée dans la liste, la fiche et le brief. */
export function optOutLabel(optOut: OptOut): string {
  return optOut.source === "nom"
    ? `Refus de démarchage affiché dans le nom de la fiche (« ${optOut.marker} »)`
    : `Refus de démarchage affiché à la place du site (« ${optOut.marker} »)`;
}
