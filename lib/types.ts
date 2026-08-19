import type { ScoreLine, ScoreTier } from "./scoring";

/** Formes échangées entre les routes API et les composants. */

export type SearchStatus = "running" | "done" | "error";

/**
 * Suivi de la prise de contact, attaché à l'établissement : il suit donc le
 * prospect d'un balayage à l'autre. `to_contact` est l'état par défaut.
 */
export type ContactStatus =
  | "to_contact"
  | "contacted"
  | "not_interested"
  | "client";

/** Consommation Places du jour, exposée par `GET /api/quota`. */
export type Quota = {
  /** En mode simulé, aucun appel n'est émis : le plafond ne s'applique pas. */
  mock: boolean;
  used: number;
  cap: number;
  remaining: number;
  /** Clé Google Places présente ? Hors mode démo, un balayage échoue sinon. */
  configured: boolean;
};

export type SearchProgress = {
  phase: "geocode" | "search" | "details" | "analyze" | "done";
  /** Libellé court affiché sous la barre de progression. */
  message: string;
  sectorsDone: number;
  sectorsTotal: number;
  candidates: number;
  analyzed: number;
  /** Appels Places réellement partis sur le réseau — donc facturés. */
  billedCalls: number;
  /** Appels évités grâce à la mémoire (cache HTTP ou données déjà en base). */
  reusedCalls: number;
};

export type SearchSummary = {
  id: number;
  /** Libellé complet du point de départ (adresse ou commune). */
  label: string;
  /** Commune seule — c'est elle qui compose la requête Places. */
  city: string | null;
  lat: number;
  lng: number;
  radiusM: number;
  sectors: string[];
  status: SearchStatus;
  error: string | null;
  createdAt: string;
  progress: SearchProgress;
  /** Nombre de prospects déjà enregistrés pour cette recherche. */
  resultCount: number;
};

/** Ligne de la liste et pin de la carte. */
export type ProspectSummary = {
  id: string;
  name: string;
  sector: string | null;
  sectorLabel: string;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  websiteUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  distanceM: number;
  score: number | null;
  tier: ScoreTier | null;
  /** Refus de démarchage affiché sur la fiche : le prospect n'est pas noté. */
  optOut: string | null;
  /** Suivi de la prise de contact (défaut : à contacter). */
  contactStatus: ContactStatus;
  /** Ignoré manuellement : grisé et repoussé en bas de liste. */
  ignored: boolean;
  /** État du site, résumé pour la liste. */
  siteState: "none" | "dead" | "alive" | "pending" | "opt_out";
  /** Signaux mis en avant sous forme d'icônes discrètes dans la liste. */
  flags: {
    mobile: boolean;
    https: boolean;
    seo: boolean;
    contact: boolean;
    modern: boolean;
  } | null;
};

export type SiteAnalysisView = {
  url: string | null;
  reachable: boolean;
  failureReason: string | null;
  https: boolean;
  hasViewport: boolean;
  hasTitle: boolean;
  hasMetaDesc: boolean;
  hasH1: boolean;
  hasSitemap: boolean;
  hasRobots: boolean;
  hasContactForm: boolean;
  hasOgTags: boolean;
  hasFavicon: boolean;
  hasAnalytics: boolean;
  hasSocials: boolean;
  cms: string | null;
  cmsVersion: string | null;
  outdatedTech: string[];
  freeBuilder: string | null;
  copyrightYear: number | null;
  pageWeightKb: number | null;
  fetchMs: number | null;
  title: string | null;
  metaDescription: string | null;
  analyticsTools: string[];
  socials: string[];
  pagesFetched: string[];
  fetchedAt: string;
};

export type EnrichmentView = {
  siren: string | null;
  siret: string | null;
  legalForm: string | null;
  naf: string | null;
  nafLabel: string | null;
  creationDate: string | null;
  dirigeantName: string | null;
  dirigeantRole: string | null;
  dirigeantSource: "gouv" | "mentions_legales" | null;
  services: string[];
  colors: { hex: string; count: number }[];
  socials: string[];
  fetchedAt: string;
};

export type ProspectDetail = {
  id: string;
  name: string;
  sector: string | null;
  sectorLabel: string;
  googleTypes: string[];
  primaryType: string | null;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  websiteUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  openingHours: string[];
  businessStatus: string | null;
  detailsFetchedAt: string | null;
  score: number | null;
  tier: ScoreTier | null;
  optOut: string | null;
  contactStatus: ContactStatus;
  ignored: boolean;
  breakdown: ScoreLine[];
  analysis: SiteAnalysisView | null;
  enrichment: EnrichmentView | null;
  searches: { id: number; label: string; distanceM: number }[];
};
