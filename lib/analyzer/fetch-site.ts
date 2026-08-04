import iconv from "iconv-lite";
import pLimit from "p-limit";
import { cachedFetch, type CachedResponse } from "../cache";

/**
 * Récupération polie des pages d'un site.
 *
 * Contraintes :
 *  - 10 s de timeout et 2 Mo par page (appliqués dans `cachedFetch`) ;
 *  - 4 requêtes en vol au maximum, toutes cibles confondues ;
 *  - une seule requête à la fois par domaine, avec 500 ms d'écart ;
 *  - User-Agent honnête : on s'identifie et on laisse un moyen de nous joindre.
 */

export const USER_AGENT =
  "Mozilla/5.0 (compatible; OpportunityBot/1.0; outil local d'audit de site; +https://example.invalid/opportunity)";

const GLOBAL_CONCURRENCY = 4;
const PER_DOMAIN_DELAY_MS = 500;

const globalLimit = pLimit(GLOBAL_CONCURRENCY);
/** Une chaîne de promesses par domaine : sérialise et espace les requêtes. */
const domainQueues = new Map<string, Promise<unknown>>();

export type FetchedPage = {
  url: string;
  /** URL finale après redirections. */
  finalUrl: string;
  status: number;
  /** HTML décodé dans l'encodage réellement déclaré par le site. */
  html: string;
  charset: string;
  bytes: number;
  ms: number;
  headers: Record<string, string>;
  error?: string;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
}

/** Sérialise par domaine et impose un délai entre deux requêtes successives. */
function perDomain<T>(url: string, task: () => Promise<T>): Promise<T> {
  const host = hostOf(url);
  const previous = domainQueues.get(host) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const result = await task();
      await new Promise((r) => setTimeout(r, PER_DOMAIN_DELAY_MS));
      return result;
    });
  domainQueues.set(
    host,
    next.catch(() => {}),
  );
  return next;
}

/**
 * Détermine l'encodage : en-tête HTTP d'abord (il fait autorité), puis
 * `<meta charset>` / `<meta http-equiv>` lus sur les premiers octets.
 * Beaucoup de vieux sites français sont en windows-1252 / iso-8859-1 :
 * les décoder en UTF-8 casserait tous les accents des signaux extraits.
 */
export function sniffCharset(
  headers: Record<string, string>,
  body: Buffer,
): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(
    headers["content-type"] ?? "",
  )?.[1];
  if (fromHeader) return normalizeCharset(fromHeader);

  const head = body.subarray(0, 4096).toString("latin1");
  const fromMeta =
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ??
    /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(head)?.[1];
  if (fromMeta) return normalizeCharset(fromMeta);

  return "utf-8";
}

function normalizeCharset(raw: string): string {
  const c = raw.trim().toLowerCase();
  // iso-8859-1 est en pratique servi comme du windows-1252 (guillemets, œ, €).
  if (c === "iso-8859-1" || c === "latin1" || c === "iso8859-1") {
    return "windows-1252";
  }
  return iconv.encodingExists(c) ? c : "utf-8";
}

function decode(res: CachedResponse): { html: string; charset: string } {
  const charset = sniffCharset(res.headers, res.body);
  try {
    return { html: iconv.decode(res.body, charset), charset };
  } catch {
    return { html: res.body.toString("utf8"), charset: "utf-8" };
  }
}

export async function fetchPage(url: string): Promise<FetchedPage> {
  return globalLimit(() =>
    perDomain(url, async () => {
      const started = Date.now();
      const res = await cachedFetch("site", url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9",
        },
      });
      const ms = Date.now() - started;
      const { html, charset } = decode(res);
      return {
        url,
        finalUrl: res.headers["x-final-url"] ?? url,
        status: res.status,
        html,
        charset,
        bytes: res.body.byteLength,
        ms,
        headers: res.headers,
        error: res.error,
      };
    }),
  );
}

/**
 * Un site peut être injoignable de plusieurs façons : DNS mort (status 0),
 * page d'erreur (4xx/5xx), ou HTML vide. Toutes valent « site mort » au score.
 */
export function isDead(page: FetchedPage): boolean {
  return page.status === 0 || page.status >= 400 || page.html.trim().length === 0;
}

/**
 * Beaucoup d'hébergeurs répondent 200 à `/robots.txt` ou `/sitemap.xml`
 * inexistants en servant la page d'accueil. On vérifie donc le contenu, pas
 * seulement le code de statut.
 */
export function looksLikeRobotsTxt(page: FetchedPage): boolean {
  if (page.status !== 200) return false;
  const type = page.headers["content-type"] ?? "";
  if (/html/i.test(type)) return false;
  if (/<html|<!doctype/i.test(page.html.slice(0, 500))) return false;
  return /^\s*(user-agent|sitemap|allow|disallow)\s*:/im.test(page.html);
}

export function looksLikeSitemap(page: FetchedPage): boolean {
  if (page.status !== 200) return false;
  if (/<html|<!doctype/i.test(page.html.slice(0, 500))) return false;
  return /<(urlset|sitemapindex)\b/i.test(page.html.slice(0, 2000));
}

/** Réinitialise l'état des files (utile entre deux tests). */
export function resetFetchQueues(): void {
  domainQueues.clear();
}
