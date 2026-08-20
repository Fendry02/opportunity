import { sectorLabel } from "../config/sectors";
import { normalizeContactStatus } from "./contact";
import { bool, getDb } from "./db";
import { optOutLabel } from "./opt-out";
import { type ScoreLine, scoreTier } from "./scoring";
import { getLatestWebsiteJobForBusiness } from "./website-jobs";
import type {
  EnrichmentView,
  OutreachMethod,
  ProspectDetail,
  ProspectSummary,
  SearchProgress,
  SearchStatus,
  SearchSummary,
  SiteAnalysisView,
} from "./types";

/**
 * Lectures de la base pour les routes API. Aucune écriture ici : le pipeline
 * est le seul à écrire, les routes ne font que restituer.
 */

const EMPTY_PROGRESS: SearchProgress = {
  phase: "geocode",
  message: "Initialisation",
  sectorsDone: 0,
  sectorsTotal: 0,
  candidates: 0,
  analyzed: 0,
  billedCalls: 0,
  reusedCalls: 0,
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type SearchRow = {
  id: number;
  label: string;
  city: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  sectors_json: string;
  status: SearchStatus;
  progress_json: string;
  error: string | null;
  created_at: string;
  result_count: number;
};

const SEARCH_SELECT = `
  SELECT s.*, (SELECT COUNT(*) FROM search_results r WHERE r.search_id = s.id) AS result_count
    FROM searches s`;

function toSearchSummary(row: SearchRow): SearchSummary {
  return {
    id: row.id,
    label: row.label,
    city: row.city,
    lat: row.lat,
    lng: row.lng,
    radiusM: row.radius_m,
    sectors: parseJson<string[]>(row.sectors_json, []),
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    progress: parseJson<SearchProgress>(row.progress_json, EMPTY_PROGRESS),
    resultCount: row.result_count,
  };
}

export function getSearch(id: number): SearchSummary | null {
  const row = getDb()
    .prepare<[number], SearchRow>(`${SEARCH_SELECT} WHERE s.id = ?`)
    .get(id);
  return row ? toSearchSummary(row) : null;
}

export function listSearches(limit = 30): SearchSummary[] {
  return getDb()
    .prepare<[number], SearchRow>(
      `${SEARCH_SELECT} ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    )
    .all(limit)
    .map(toSearchSummary);
}

type ResultRow = {
  id: string;
  name: string;
  sector: string | null;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  rating: number | null;
  review_count: number | null;
  distance_m: number;
  details_fetched_at: string | null;
  total: number | null;
  reachable: number | null;
  has_viewport: number | null;
  https: number | null;
  has_title: number | null;
  has_meta_desc: number | null;
  has_h1: number | null;
  has_contact_form: number | null;
  outdated_tech: string | null;
  free_builder: string | null;
  analysis_url: string | null;
  opt_out_marker: string | null;
  opt_out_source: string | null;
  contact_status: string | null;
  outreach_method: string | null;
  ignored: number;
};

const RESULTS_SQL = `
  SELECT b.id, b.name, b.sector, b.lat, b.lng, b.address, b.phone, b.website_url,
         b.rating, b.review_count, b.details_fetched_at,
         b.opt_out_marker, b.opt_out_source, b.contact_status,
         b.outreach_method, b.ignored,
         r.distance_m,
         sc.total,
         a.reachable, a.has_viewport, a.https, a.has_title, a.has_meta_desc,
         a.has_h1, a.has_contact_form, a.outdated_tech, a.free_builder,
         a.url AS analysis_url
    FROM search_results r
    JOIN businesses b ON b.id = r.business_id
    LEFT JOIN scores sc ON sc.business_id = b.id
    LEFT JOIN site_analyses a ON a.business_id = b.id
   WHERE r.search_id = ?
   ORDER BY sc.total DESC NULLS LAST, r.distance_m ASC`;

function siteState(row: ResultRow): ProspectSummary["siteState"] {
  if (row.opt_out_marker) return "opt_out";
  if (row.total === null) return "pending";
  if (!row.website_url) return "none";
  if (row.reachable === null) return "pending";
  return row.reachable === 1 ? "alive" : "dead";
}

function optOutLabelOf(row: {
  opt_out_marker: string | null;
  opt_out_source: string | null;
}): string | null {
  if (!row.opt_out_marker) return null;
  return optOutLabel({
    marker: row.opt_out_marker,
    source: row.opt_out_source === "nom" ? "nom" : "site",
  });
}

function toSummary(row: ResultRow): ProspectSummary {
  const analysed = row.reachable === 1;
  return {
    id: row.id,
    name: row.name,
    sector: row.sector,
    sectorLabel: row.sector ? sectorLabel(row.sector) : "—",
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    phone: row.phone,
    websiteUrl: row.website_url,
    rating: row.rating,
    reviewCount: row.review_count,
    distanceM: row.distance_m,
    score: row.total,
    tier: row.total === null ? null : scoreTier(row.total),
    optOut: optOutLabelOf(row),
    contactStatus: normalizeContactStatus(row.contact_status),
    outreachMethod: normalizeOutreachMethod(row.outreach_method),
    ignored: bool(row.ignored),
    siteState: siteState(row),
    flags: analysed
      ? {
          mobile: row.has_viewport === 1,
          https: row.https === 1,
          seo: row.has_title === 1 && row.has_meta_desc === 1 && row.has_h1 === 1,
          contact: row.has_contact_form === 1,
          modern:
            parseJson<string[]>(row.outdated_tech, []).length === 0 &&
            !row.free_builder,
        }
      : null,
  };
}

export function listSearchResults(searchId: number): ProspectSummary[] {
  return getDb()
    .prepare<[number], ResultRow>(RESULTS_SQL)
    .all(searchId)
    .map(toSummary);
}

type BusinessRow = {
  id: string;
  name: string;
  sector: string | null;
  google_types_json: string;
  primary_type: string | null;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  rating: number | null;
  review_count: number | null;
  opening_hours_json: string | null;
  business_status: string | null;
  details_fetched_at: string | null;
  opt_out_marker: string | null;
  opt_out_source: string | null;
  contact_status: string | null;
  outreach_method: string | null;
  outreach_email: string | null;
  outreach_email_source: string | null;
  ignored: number;
};

function normalizeOutreachMethod(value: string | null): OutreachMethod {
  return value === "email" ? "email" : "visit";
}

type AnalysisRow = {
  url: string | null;
  reachable: number;
  https: number;
  has_viewport: number;
  has_title: number;
  has_meta_desc: number;
  has_h1: number;
  has_sitemap: number;
  has_robots: number;
  has_contact_form: number;
  has_og_tags: number;
  has_favicon: number;
  has_analytics: number;
  has_socials: number;
  cms: string | null;
  cms_version: string | null;
  outdated_tech: string | null;
  free_builder: string | null;
  copyright_year: number | null;
  page_weight_kb: number | null;
  fetch_ms: number | null;
  failure_reason: string | null;
  raw_signals_json: string;
  fetched_at: string;
};

type EnrichmentRow = {
  siren: string | null;
  siret: string | null;
  legal_form: string | null;
  naf: string | null;
  naf_label: string | null;
  creation_date: string | null;
  dirigeant_name: string | null;
  dirigeant_role: string | null;
  dirigeant_source: string | null;
  services_json: string;
  colors_json: string;
  socials_json: string;
  fetched_at: string;
};

type RawSignals = {
  title?: string | null;
  metaDescription?: string | null;
  analyticsTools?: string[];
  socials?: string[];
  pagesFetched?: string[];
  navLabels?: string[];
  headings?: string[];
  cssUrls?: string[];
  inlineColors?: string[];
  finalUrl?: string;
};

function toAnalysisView(row: AnalysisRow): SiteAnalysisView {
  const raw = parseJson<RawSignals>(row.raw_signals_json, {});
  return {
    url: row.url,
    reachable: row.reachable === 1,
    failureReason: row.failure_reason,
    https: row.https === 1,
    hasViewport: row.has_viewport === 1,
    hasTitle: row.has_title === 1,
    hasMetaDesc: row.has_meta_desc === 1,
    hasH1: row.has_h1 === 1,
    hasSitemap: row.has_sitemap === 1,
    hasRobots: row.has_robots === 1,
    hasContactForm: row.has_contact_form === 1,
    hasOgTags: row.has_og_tags === 1,
    hasFavicon: row.has_favicon === 1,
    hasAnalytics: row.has_analytics === 1,
    hasSocials: row.has_socials === 1,
    cms: row.cms,
    cmsVersion: row.cms_version,
    outdatedTech: parseJson<string[]>(row.outdated_tech, []),
    freeBuilder: row.free_builder,
    copyrightYear: row.copyright_year,
    pageWeightKb: row.page_weight_kb,
    fetchMs: row.fetch_ms,
    title: raw.title ?? null,
    metaDescription: raw.metaDescription ?? null,
    analyticsTools: raw.analyticsTools ?? [],
    socials: raw.socials ?? [],
    pagesFetched: raw.pagesFetched ?? [],
    fetchedAt: row.fetched_at,
  };
}

function toEnrichmentView(row: EnrichmentRow): EnrichmentView {
  return {
    siren: row.siren,
    siret: row.siret,
    legalForm: row.legal_form,
    naf: row.naf,
    nafLabel: row.naf_label,
    creationDate: row.creation_date,
    dirigeantName: row.dirigeant_name,
    dirigeantRole: row.dirigeant_role,
    dirigeantSource: row.dirigeant_source as EnrichmentView["dirigeantSource"],
    services: parseJson<string[]>(row.services_json, []),
    colors: parseJson<EnrichmentView["colors"]>(row.colors_json, []),
    socials: parseJson<string[]>(row.socials_json, []),
    fetchedAt: row.fetched_at,
  };
}

export function getProspect(id: string): ProspectDetail | null {
  const db = getDb();
  const business = db
    .prepare<[string], BusinessRow>(`SELECT * FROM businesses WHERE id = ?`)
    .get(id);
  if (!business) return null;

  const score = db
    .prepare<[string], { total: number; breakdown_json: string }>(
      `SELECT total, breakdown_json FROM scores WHERE business_id = ?`,
    )
    .get(id);
  const analysis = db
    .prepare<[string], AnalysisRow>(
      `SELECT * FROM site_analyses WHERE business_id = ?`,
    )
    .get(id);
  const enrichment = db
    .prepare<[string], EnrichmentRow>(
      `SELECT * FROM enrichments WHERE business_id = ?`,
    )
    .get(id);
  const searches = db
    .prepare<[string], { id: number; label: string; distance_m: number }>(
      `SELECT s.id, s.label, r.distance_m
         FROM search_results r JOIN searches s ON s.id = r.search_id
        WHERE r.business_id = ?
        ORDER BY s.created_at DESC`,
    )
    .all(id);

  return {
    id: business.id,
    name: business.name,
    sector: business.sector,
    sectorLabel: business.sector ? sectorLabel(business.sector) : "—",
    googleTypes: parseJson<string[]>(business.google_types_json, []),
    primaryType: business.primary_type,
    lat: business.lat,
    lng: business.lng,
    address: business.address,
    phone: business.phone,
    websiteUrl: business.website_url,
    rating: business.rating,
    reviewCount: business.review_count,
    openingHours: parseJson<string[]>(business.opening_hours_json, []),
    businessStatus: business.business_status,
    detailsFetchedAt: business.details_fetched_at,
    score: score?.total ?? null,
    tier: score ? scoreTier(score.total) : null,
    optOut: optOutLabelOf(business),
    contactStatus: normalizeContactStatus(business.contact_status),
    outreach: {
      method: normalizeOutreachMethod(business.outreach_method),
      recipientEmail: business.outreach_email,
      recipientEmailSource:
        business.outreach_email_source === "public_site" ||
        business.outreach_email_source === "manual"
          ? business.outreach_email_source
          : null,
    },
    ignored: bool(business.ignored),
    websiteProject: getLatestWebsiteJobForBusiness(business.id),
    breakdown: parseJson<ScoreLine[]>(score?.breakdown_json, []),
    analysis: analysis ? toAnalysisView(analysis) : null,
    enrichment: enrichment ? toEnrichmentView(enrichment) : null,
    searches: searches.map((s) => ({
      id: s.id,
      label: s.label,
      distanceM: s.distance_m,
    })),
  };
}

/**
 * Analyse déjà en base, telle quelle. Permet de recalculer un score sans
 * refetcher le site du prospect.
 */
export function getAnalysis(businessId: string): SiteAnalysisView | null {
  const row = getDb()
    .prepare<[string], AnalysisRow>(
      `SELECT * FROM site_analyses WHERE business_id = ?`,
    )
    .get(businessId);
  return row ? toAnalysisView(row) : null;
}

/** Signaux bruts d'un site, tels que stockés — utilisés par l'enrichissement. */
export function getRawSignals(businessId: string): RawSignals | null {
  const row = getDb()
    .prepare<[string], { raw_signals_json: string }>(
      `SELECT raw_signals_json FROM site_analyses WHERE business_id = ?`,
    )
    .get(businessId);
  return row ? parseJson<RawSignals>(row.raw_signals_json, {}) : null;
}
