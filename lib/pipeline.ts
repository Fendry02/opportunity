import { SECTORS_BY_ID } from "../config/sectors";
import { analyzeSite, type SiteSignals } from "./analyzer/signals";
import { getDb, int } from "./db";
import { geoSlug, geocode, haversineM } from "./geocode";
import {
  detectOptOutInName,
  detectOptOutInWebsite,
  type OptOut,
} from "./opt-out";
import { getDetails, placesCallsToday, searchText } from "./places/client";
import type { PlaceSearchResult } from "./places/types";
import { getAnalysis } from "./queries";
import { type ScoreSignals, computeScore } from "./scoring";
import type { SearchProgress } from "./types";

/**
 * Orchestration d'un balayage : géocodage → recherche par secteur →
 * détails → analyse des sites → score.
 *
 * Le pipeline tourne en tâche de fond dans le process Node (promesse non
 * attendue lancée par la route POST). Il écrit au fur et à mesure : l'UI
 * interroge la base par polling et affiche les résultats partiels.
 * En local, une file ou du SSE serait de la complexité pour rien.
 */

const ANALYSIS_CONCURRENCY = 4;

/**
 * Fraîcheur au-delà de laquelle on redemande la donnée.
 *
 * C'est le deuxième niveau de mémoire, au-dessus du cache HTTP : même si une
 * entrée de `api_cache` a expiré ou été purgée, un prospect déjà détaillé
 * récemment ne redéclenche pas d'appel facturé.
 */
const DETAILS_FRESH_DAYS = Number(process.env.DETAILS_FRESH_DAYS ?? 30);
const ANALYSIS_FRESH_DAYS = Number(process.env.ANALYSIS_FRESH_DAYS ?? 7);

export function isFresh(fetchedAt: string | null, maxAgeDays: number): boolean {
  if (!fetchedAt) return false;
  // SQLite stocke `datetime('now')` en UTC sans suffixe : on le rend explicite.
  const stamp = fetchedAt.includes("T") ? fetchedAt : `${fetchedAt.replace(" ", "T")}Z`;
  const age = Date.now() - new Date(stamp).getTime();
  return Number.isFinite(age) && age >= 0 && age < maxAgeDays * 86_400_000;
}

export type CreateSearchInput = {
  /** Commune ou adresse précise : le rayon est centré sur ce point. */
  city: string;
  radiusM: number;
  sectors: string[];
};

export type CreatedSearch = { id: number; lat: number; lng: number; label: string };

/**
 * Crée la ligne `searches`. Le géocodage est fait ici (synchrone du point de
 * vue de l'appelant) pour pouvoir refuser tout de suite une adresse inconnue.
 */
export async function createSearch(
  input: CreateSearchInput,
): Promise<CreatedSearch> {
  const place = await geocode(input.city);

  const info = getDb()
    .prepare(
      `INSERT INTO searches (label, city, lat, lng, radius_m, sectors_json, status, progress_json)
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
    )
    .run(
      place.label,
      place.city,
      place.lat,
      place.lng,
      input.radiusM,
      JSON.stringify(input.sectors),
      JSON.stringify(initialProgress(input.sectors.length)),
    );

  return {
    id: Number(info.lastInsertRowid),
    lat: place.lat,
    lng: place.lng,
    label: place.label,
  };
}

function initialProgress(sectorsTotal: number): SearchProgress {
  return {
    phase: "search",
    message: "Recherche des établissements",
    sectorsDone: 0,
    sectorsTotal,
    candidates: 0,
    analyzed: 0,
    billedCalls: 0,
    reusedCalls: 0,
  };
}

function setProgress(searchId: number, progress: SearchProgress): void {
  getDb()
    .prepare(`UPDATE searches SET progress_json = ? WHERE id = ?`)
    .run(JSON.stringify(progress), searchId);
}

function finish(searchId: number, error?: string): void {
  getDb()
    .prepare(`UPDATE searches SET status = ?, error = ? WHERE id = ?`)
    .run(error ? "error" : "done", error ?? null, searchId);
}

type SearchRow = {
  id: number;
  label: string;
  city: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  sectors_json: string;
};

/** Retient les établissements réellement démarchables et dans le rayon. */
function keepCandidate(
  place: PlaceSearchResult,
  center: { lat: number; lng: number },
  radiusM: number,
): { distanceM: number } | null {
  if (!place.location) return null;
  if (place.businessStatus === "CLOSED_PERMANENTLY") return null;

  const distanceM = haversineM(center, {
    lat: place.location.latitude,
    lng: place.location.longitude,
  });
  // Le `locationBias` de Google n'est qu'une préférence : le filtrage strict
  // se fait ici, sinon on ramasse des résultats à 30 km.
  return distanceM <= radiusM ? { distanceM } : null;
}

function upsertBusiness(
  place: PlaceSearchResult,
  sectorId: string,
  optOut: OptOut | null,
): void {
  getDb()
    .prepare(
      `INSERT INTO businesses
         (id, name, sector, google_types_json, primary_type, lat, lng, address,
          business_status, opt_out_marker, opt_out_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         google_types_json = excluded.google_types_json,
         primary_type = excluded.primary_type,
         lat = excluded.lat,
         lng = excluded.lng,
         address = excluded.address,
         business_status = excluded.business_status,
         opt_out_marker = excluded.opt_out_marker,
         opt_out_source = excluded.opt_out_source`,
    )
    .run(
      place.id,
      place.displayName?.text ?? place.id,
      sectorId,
      JSON.stringify(place.types ?? []),
      place.primaryType ?? null,
      place.location!.latitude,
      place.location!.longitude,
      place.formattedAddress ?? null,
      place.businessStatus ?? null,
      optOut?.marker ?? null,
      optOut?.source ?? null,
    );
}

/** Marque un prospect écarté après coup, quand l'URL trahit le refus. */
function markOptOut(businessId: string, optOut: OptOut): void {
  getDb()
    .prepare(
      `UPDATE businesses SET opt_out_marker = ?, opt_out_source = ? WHERE id = ?`,
    )
    .run(optOut.marker, optOut.source, businessId);
  // Un prospect écarté ne doit porter ni score ni analyse.
  getDb().prepare(`DELETE FROM scores WHERE business_id = ?`).run(businessId);
  getDb()
    .prepare(`DELETE FROM site_analyses WHERE business_id = ?`)
    .run(businessId);
}

function linkResult(searchId: number, businessId: string, distanceM: number): void {
  getDb()
    .prepare(
      `INSERT INTO search_results (search_id, business_id, distance_m)
       VALUES (?, ?, ?)
       ON CONFLICT(search_id, business_id) DO UPDATE SET distance_m = excluded.distance_m`,
    )
    .run(searchId, businessId, distanceM);
}

function saveAnalysis(businessId: string, s: SiteSignals): void {
  getDb()
    .prepare(
      `INSERT INTO site_analyses (
         business_id, url, reachable, https, has_viewport, has_title, has_meta_desc,
         has_h1, has_sitemap, has_robots, has_contact_form, has_og_tags, has_favicon,
         has_analytics, has_socials, cms, cms_version, outdated_tech, free_builder,
         copyright_year, page_weight_kb, fetch_ms, failure_reason, raw_signals_json,
         fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(business_id) DO UPDATE SET
         url = excluded.url, reachable = excluded.reachable, https = excluded.https,
         has_viewport = excluded.has_viewport, has_title = excluded.has_title,
         has_meta_desc = excluded.has_meta_desc, has_h1 = excluded.has_h1,
         has_sitemap = excluded.has_sitemap, has_robots = excluded.has_robots,
         has_contact_form = excluded.has_contact_form, has_og_tags = excluded.has_og_tags,
         has_favicon = excluded.has_favicon, has_analytics = excluded.has_analytics,
         has_socials = excluded.has_socials, cms = excluded.cms,
         cms_version = excluded.cms_version, outdated_tech = excluded.outdated_tech,
         free_builder = excluded.free_builder, copyright_year = excluded.copyright_year,
         page_weight_kb = excluded.page_weight_kb, fetch_ms = excluded.fetch_ms,
         failure_reason = excluded.failure_reason,
         raw_signals_json = excluded.raw_signals_json,
         fetched_at = datetime('now')`,
    )
    .run(
      businessId,
      s.url,
      int(s.reachable),
      int(s.https),
      int(s.hasViewport),
      int(s.hasTitle),
      int(s.hasMetaDesc),
      int(s.hasH1),
      int(s.hasSitemap),
      int(s.hasRobots),
      int(s.hasContactForm),
      int(s.hasOgTags),
      int(s.hasFavicon),
      int(s.hasAnalytics),
      int(s.hasSocials),
      s.cms,
      s.cmsVersion,
      JSON.stringify(s.outdatedTech),
      s.freeBuilder,
      s.copyrightYear,
      s.pageWeightKb,
      s.fetchMs,
      s.failureReason,
      JSON.stringify({
        finalUrl: s.finalUrl,
        title: s.title,
        metaDescription: s.metaDescription,
        analyticsTools: s.analyticsTools,
        socials: s.socials,
        navLabels: s.navLabels,
        headings: s.headings,
        pagesFetched: s.pagesFetched,
        cssUrls: s.cssUrls,
        inlineColors: s.inlineColors,
      }),
    );
}

function saveScore(
  businessId: string,
  total: number,
  breakdown: unknown,
): void {
  getDb()
    .prepare(
      `INSERT INTO scores (business_id, total, breakdown_json, computed_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(business_id) DO UPDATE SET
         total = excluded.total,
         breakdown_json = excluded.breakdown_json,
         computed_at = datetime('now')`,
    )
    .run(businessId, total, JSON.stringify(breakdown));
}

/** Exécute le balayage. Ne rejette jamais : l'erreur est stockée sur la ligne. */
export async function runSearch(searchId: number): Promise<void> {
  const db = getDb();
  const search = db
    .prepare<[number], SearchRow>(`SELECT * FROM searches WHERE id = ?`)
    .get(searchId);
  if (!search) return;

  const sectors = JSON.parse(search.sectors_json) as string[];
  const center = { lat: search.lat, lng: search.lng };
  // Google cherche par ville ; c'est le centre et le rayon, calculés à partir
  // de l'adresse exacte, qui font le filtrage fin.
  const city = search.city ?? search.label;
  const citySlug = geoSlug(city);
  const progress = initialProgress(sectors.length);

  // Sert à mesurer ce que cette recherche a réellement coûté.
  const callsBefore = placesCallsToday();

  try {
    const candidates: { id: string; websiteUrl: string | null }[] = [];
    let optedOut = 0;

    for (const sectorId of sectors) {
      const sector = SECTORS_BY_ID.get(sectorId);
      if (!sector) {
        progress.sectorsDone += 1;
        continue;
      }

      progress.message = `Recherche : ${sector.label}`;
      setProgress(searchId, progress);

      const places = await searchText({
        textQuery: `${sector.query} à ${city}`,
        lat: center.lat,
        lng: center.lng,
        radiusM: search.radius_m,
        fixture: `${sectorId}-${citySlug}.json`,
      });

      for (const place of places) {
        const kept = keepCandidate(place, center, search.radius_m);
        if (!kept) continue;

        // Le nom vient de la recherche (SKU Pro) : détecter le refus ici évite
        // de payer l'appel de détails pour un prospect qu'on va écarter.
        const optOut = detectOptOutInName(place.displayName?.text ?? "");
        upsertBusiness(place, sectorId, optOut);
        linkResult(searchId, place.id, kept.distanceM);

        if (optOut) {
          optedOut += 1;
          continue;
        }
        candidates.push({ id: place.id, websiteUrl: null });
      }

      progress.sectorsDone += 1;
      progress.candidates = candidates.length;
      setProgress(searchId, progress);
    }

    // Étape facturée au tarif Enterprise : uniquement sur les retenus.
    progress.phase = "details";
    progress.message = "Récupération des coordonnées";
    setProgress(searchId, progress);

    const readDetails = db.prepare<
      [string],
      { website_url: string | null; details_fetched_at: string | null }
    >(`SELECT website_url, details_fetched_at FROM businesses WHERE id = ?`);

    for (const candidate of candidates) {
      // Le prospect a déjà été détaillé récemment — souvent lors d'une
      // recherche voisine : on réutilise la ligne, aucun appel n'est émis.
      const known = readDetails.get(candidate.id);
      if (known && isFresh(known.details_fetched_at, DETAILS_FRESH_DAYS)) {
        candidate.websiteUrl = known.website_url;
        progress.reusedCalls += 1;
        continue;
      }

      const details = await getDetails(candidate.id);
      candidate.websiteUrl = details.websiteUri ?? null;
      db.prepare(
        `UPDATE businesses SET
           website_url = ?, phone = ?, rating = ?, review_count = ?,
           opening_hours_json = ?, details_fetched_at = datetime('now')
         WHERE id = ?`,
      ).run(
        details.websiteUri ?? null,
        details.nationalPhoneNumber ?? null,
        details.rating ?? null,
        details.userRatingCount ?? null,
        JSON.stringify(details.regularOpeningHours?.weekdayDescriptions ?? []),
        candidate.id,
      );
    }

    // Le refus est souvent porté par un faux nom de domaine : il n'apparaît
    // donc qu'après les détails. Ces prospects ne sont pas analysés.
    const analysable = candidates.filter((candidate) => {
      const optOut = detectOptOutInWebsite(candidate.websiteUrl);
      if (!optOut) return true;
      markOptOut(candidate.id, optOut);
      optedOut += 1;
      return false;
    });

    progress.phase = "analyze";
    progress.message = "Analyse des sites";
    progress.candidates = analysable.length;
    setProgress(searchId, progress);

    await inBatches(analysable, ANALYSIS_CONCURRENCY, async (candidate) => {
      const reused = await analyzeAndScore(candidate.id, candidate.websiteUrl, {
        reuseFreshAnalysis: true,
      });
      if (reused) progress.reusedCalls += 1;
      progress.analyzed += 1;
      setProgress(searchId, progress);
    });

    progress.phase = "done";
    progress.billedCalls = placesCallsToday() - callsBefore;
    progress.message =
      `${analysable.length} prospect(s) analysé(s)` +
      (optedOut > 0 ? ` · ${optedOut} écarté(s) (refus de démarchage)` : "") +
      ` · ${progress.billedCalls} appel(s) Places facturé(s)` +
      (progress.reusedCalls > 0
        ? `, ${progress.reusedCalls} repris de la mémoire`
        : "");
    setProgress(searchId, progress);
    finish(searchId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setProgress(searchId, { ...progress, message: `Interrompu : ${message}` });
    finish(searchId, message);
  }
}

/**
 * Analyse le site d'un prospect (s'il en a un) puis calcule son score.
 *
 * Avec `reuseFreshAnalysis`, une analyse récente du même site est réutilisée
 * telle quelle : le score est recalculé sur les signaux stockés, aucune
 * requête n'est envoyée au site du prospect. Renvoie `true` si c'est le cas.
 */
async function analyzeAndScore(
  businessId: string,
  websiteUrl: string | null,
  options: { reuseFreshAnalysis?: boolean } = {},
): Promise<boolean> {
  const db = getDb();
  let signals: ScoreSignals | null = null;
  let reused = false;

  if (websiteUrl) {
    const stored = options.reuseFreshAnalysis ? getAnalysis(businessId) : null;
    if (
      stored &&
      stored.url === websiteUrl &&
      isFresh(stored.fetchedAt, ANALYSIS_FRESH_DAYS)
    ) {
      signals = stored;
      reused = true;
    } else {
      const fresh = await analyzeSite(websiteUrl);
      saveAnalysis(businessId, fresh);
      signals = fresh;
    }
  } else {
    db.prepare(`DELETE FROM site_analyses WHERE business_id = ?`).run(businessId);
  }

  const business = db
    .prepare<[string], { rating: number | null; review_count: number | null; phone: string | null }>(
      `SELECT rating, review_count, phone FROM businesses WHERE id = ?`,
    )
    .get(businessId);

  const score = computeScore({
    signals,
    rating: business?.rating ?? null,
    reviewCount: business?.review_count ?? null,
    phone: business?.phone ?? null,
  });
  saveScore(businessId, score.total, score.breakdown);
  return reused;
}

/** Petit ordonnanceur : n tâches en vol, sans dépendance supplémentaire. */
async function inBatches<T>(
  items: T[],
  size: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await task(items[index]);
    }
  });
  await Promise.all(workers);
}

/**
 * Lance le balayage sans l'attendre. La promesse est volontairement orpheline :
 * la route répond immédiatement et l'UI suit par polling.
 */
export function startSearch(searchId: number): void {
  void runSearch(searchId).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    finish(searchId, message);
  });
}
