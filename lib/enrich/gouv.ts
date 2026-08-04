import { bodyAsJson, cachedFetch } from "../cache";
import { nafLabel, natureJuridiqueLabel } from "./insee-labels";

/**
 * API recherche-entreprises.api.gouv.fr — gratuite, sans clé, ~7 req/s.
 *
 * Les homonymies sont fréquentes (« Garage Martin » existe partout) : on
 * contraint donc systématiquement par code postal, et on préfère un SIRET
 * trouvé dans les mentions légales quand il y en a un.
 */

const ENDPOINT = "https://recherche-entreprises.api.gouv.fr/search";

export type GouvCompany = {
  siren: string;
  siret: string | null;
  legalForm: string | null;
  naf: string | null;
  nafLabel: string | null;
  creationDate: string | null;
  dirigeantName: string | null;
  dirigeantRole: string | null;
  matchedName: string;
};

type ApiDirigeant = {
  nom?: string;
  prenoms?: string;
  qualite?: string;
  denomination?: string;
  type_dirigeant?: string;
};

type ApiSiege = {
  siret?: string;
  code_postal?: string;
  activite_principale?: string;
};

/**
 * L'API ne renvoie que des codes (`nature_juridique: "5499"`,
 * `activite_principale: "43.22A"`) — jamais leurs libellés. La traduction se
 * fait dans `insee-labels.ts`.
 */
type ApiResult = {
  siren?: string;
  nom_complet?: string;
  nom_raison_sociale?: string;
  nature_juridique?: string;
  activite_principale?: string;
  section_activite_principale?: string;
  date_creation?: string;
  etat_administratif?: string;
  siege?: ApiSiege;
  dirigeants?: ApiDirigeant[];
  matching_etablissements?: { siret?: string; code_postal?: string }[];
};

type ApiResponse = { results?: ApiResult[] };

/** Normalise un nom d'entreprise pour comparer « SARL Réno' Bâti » et « reno bati ». */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(
      /\b(sarl|sas|sasu|eurl|sa|sci|snc|earl|scop|ets|etablissements|entreprise|societe|monsieur|madame|mr|mme)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Similarité par mots communs : suffisant pour départager des homonymes. */
export function nameSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeName(a).split(" ").filter(Boolean));
  const wordsB = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let common = 0;
  for (const word of wordsA) if (wordsB.has(word)) common += 1;
  return common / Math.min(wordsA.size, wordsB.size);
}

function formatDirigeant(d: ApiDirigeant): { name: string; role: string } | null {
  const role = d.qualite?.trim() || d.type_dirigeant || "Dirigeant";
  if (d.denomination) return { name: d.denomination, role };
  const parts = [d.prenoms, d.nom].filter(Boolean).join(" ").trim();
  if (!parts) return null;
  // L'API renvoie les noms en majuscules : « JEAN DUPONT » → « Jean Dupont ».
  const name = parts
    .toLowerCase()
    .replace(/(^|[\s'-])([a-zà-ÿ])/g, (_, sep: string, letter: string) => sep + letter.toUpperCase());
  return { name, role };
}

function pickDirigeant(result: ApiResult): { name: string; role: string } | null {
  for (const d of result.dirigeants ?? []) {
    const formatted = formatDirigeant(d);
    if (formatted) return formatted;
  }
  return null;
}

/** Slug de fixture (mode mock) : `<nom>-<cp>.json`. */
function fixtureName(name: string, postcode: string): string {
  return `${normalizeName(name).replace(/\s+/g, "-")}-${postcode}.json`;
}

export type LookupOptions = {
  name: string;
  postcode: string;
  /** SIRET relevé dans les mentions légales : fait foi s'il est fourni. */
  siretHint?: string | null;
};

export async function lookupCompany(
  options: LookupOptions,
): Promise<GouvCompany | null> {
  const query = options.siretHint ?? options.name;
  const params = new URLSearchParams({ q: query, per_page: "10" });
  if (!options.siretHint && options.postcode) {
    params.set("code_postal", options.postcode);
  }

  const res = await cachedFetch("gouv", `${ENDPOINT}?${params}`, {
    fixture: fixtureName(query, options.postcode),
  });
  if (res.status !== 200) return null;

  const results = bodyAsJson<ApiResponse>(res).results ?? [];
  if (results.length === 0) return null;

  const best = options.siretHint
    ? results[0]
    : bestNameMatch(results, options.name);
  if (!best) return null;

  const dirigeant = pickDirigeant(best);
  const siret =
    options.siretHint ??
    best.matching_etablissements?.[0]?.siret ??
    best.siege?.siret ??
    null;

  const naf = best.activite_principale ?? best.siege?.activite_principale ?? null;

  return {
    siren: best.siren ?? "",
    siret,
    legalForm: natureJuridiqueLabel(best.nature_juridique),
    naf,
    nafLabel: nafLabel(naf, best.section_activite_principale),
    creationDate: best.date_creation ?? null,
    dirigeantName: dirigeant?.name ?? null,
    dirigeantRole: dirigeant?.role ?? null,
    matchedName: best.nom_complet ?? best.nom_raison_sociale ?? "",
  };
}

/** Retient le meilleur homonyme, et rien du tout si aucun n'est convaincant. */
function bestNameMatch(results: ApiResult[], name: string): ApiResult | null {
  let best: { result: ApiResult; score: number } | null = null;
  for (const result of results) {
    const candidate = result.nom_complet ?? result.nom_raison_sociale ?? "";
    const score = nameSimilarity(name, candidate);
    if (!best || score > best.score) best = { result, score };
  }
  return best && best.score >= 0.5 ? best.result : null;
}
