import { SECTORS_BY_ID, type Sector } from "../../config/sectors";

/**
 * Déduit les prestations affichées par l'entreprise à partir des libellés de
 * navigation et des titres h2/h3 déjà collectés par l'analyseur (aucun fetch
 * supplémentaire), croisés avec le secteur Google.
 *
 * Objectif : donner au commercial de quoi parler du métier du prospect dans
 * les premières minutes du rendez-vous.
 */

const MAX_SERVICES = 8;

/** Formulations qui ne décrivent jamais une prestation. */
const NOISE =
  /^(nous|notre|nos|votre|vos|bienvenue|accueil|actualit|derni|suivez|newsletter|horaires?|avis|t[ée]l[ée]phone|adresse|plan|acc[eè]s|mentions|cookies?|politique|conditions|informations?|en savoir plus|voir plus|lire la suite|menu|d[ée]couvrir)/i;

/** Vocabulaire métier attendu selon le secteur : renforce le tri. */
const SECTOR_HINTS: Record<string, RegExp> = {
  plombier: /plomb|fuite|canalisation|chauffe-eau|chaudi|sanitaire|d[ée]bouch|salle de bain/i,
  electricien: /[ée]lectri|tableau|domotique|mise aux normes|[ée]clairage|borne/i,
  menuisier: /menuis|fen[êe]tre|porte|parquet|escalier|dressing|agencement|volet/i,
  macon: /ma[çc]on|dalle|mur|extension|terrasse|fondation|ravalement/i,
  peintre: /peinture|enduit|papier peint|rev[êe]tement|fa[çc]ade/i,
  couvreur: /toiture|couvert|charpente|zinguerie|goutti[èe]re|d[ée]mouss/i,
  paysagiste: /jardin|[ée]lagage|tonte|paysag|cl[ôo]ture|arrosage|terrasse/i,
  restaurant: /menu|carte|plat|midi|soir|privatisation|traiteur|groupe|d[ée]jeuner|d[îi]ner|sp[ée]cialit/i,
  boulangerie: /pain|viennoiser|p[âa]tisser|traiteur|sandwich|gateau/i,
  boucherie: /viande|charcuter|volaille|traiteur|barbecue|colis/i,
  coiffeur: /coupe|couleur|balayage|brushing|chignon|lissage|m[èe]che|extension|barbe/i,
  esthetique: /soin|[ée]pilation|massage|manucure|ongles|visage|maquillage|beaut/i,
  garage: /entretien|r[ée]vision|pneu|vidange|diagnostic|carrosserie|climatisation|freins?|occasion/i,
  auto_ecole: /permis|conduite|code|conduite accompagn|stage|forfait/i,
  fleuriste: /bouquet|composition|mariage|deuil|plante|abonnement/i,
  opticien: /lunette|verre|lentille|vue|solaire|monture/i,
  veterinaire: /consultation|vaccin|chirurgie|st[ée]rilisation|urgence|identification/i,
  kine: /r[ée][ée]ducation|kin[ée]|massage|sport|respiratoire|post-op/i,
  dentiste: /implant|proth[èe]se|orthodont|blanchiment|d[ée]tartrage|carie/i,
  avocat: /droit|divorce|p[ée]nal|travail|famille|immobilier|conseil|contentieux/i,
  comptable: /comptab|bilan|fiscal|paie|social|cr[ée]ation d'entreprise|audit/i,
  agence_immo: /vente|location|estimation|gestion|syndic|investissement/i,
};

export type ServiceSource = {
  navLabels: string[];
  headings: string[];
  sectorId: string | null;
  primaryType: string | null;
};

export function deduceServices(source: ServiceSource): string[] {
  const sector = source.sectorId ? SECTORS_BY_ID.get(source.sectorId) : undefined;
  const hint = source.sectorId ? SECTOR_HINTS[source.sectorId] : undefined;

  const candidates = [...source.headings, ...source.navLabels]
    .map(clean)
    .filter((label) => label.length >= 4 && label.length <= 60)
    .filter((label) => !NOISE.test(label));

  const seen = new Set<string>();
  const scored: { label: string; score: number }[] = [];

  for (const label of candidates) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    let score = 0;
    // Un h2/h3 décrit une prestation plus souvent qu'un lien de menu.
    if (source.headings.map(clean).includes(label)) score += 2;
    if (hint?.test(label)) score += 3;
    if (matchesSectorType(label, sector, source.primaryType)) score += 1;
    // Deux à quatre mots : la forme habituelle d'un intitulé de prestation.
    const words = label.split(/\s+/).length;
    if (words >= 2 && words <= 5) score += 1;
    scored.push({ label, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((entry) => entry.score > 0)
    .slice(0, MAX_SERVICES)
    .map((entry) => entry.label);
}

function matchesSectorType(
  label: string,
  sector: Sector | undefined,
  primaryType: string | null,
): boolean {
  const haystack = `${sector?.query ?? ""} ${primaryType ?? ""}`.toLowerCase();
  if (!haystack.trim()) return false;
  return label
    .toLowerCase()
    .split(/\s+/)
    .some((word) => word.length > 4 && haystack.includes(word));
}

function clean(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}
