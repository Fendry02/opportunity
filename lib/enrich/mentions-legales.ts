import * as cheerio from "cheerio";
import { fetchPage, isDead } from "../analyzer/fetch-site";

/**
 * Repli quand l'API gouv ne tranche pas : les mentions légales d'un site
 * français contiennent presque toujours le nom du responsable de publication
 * et souvent le SIRET.
 */

const CANDIDATE_PATHS = [
  "/mentions-legales",
  "/mentions-legales/",
  "/mentions-legales.html",
  "/mentions-legales.php",
  "/mentions",
  "/legal",
];

const ROLE_PATTERN =
  /(directeur de (?:la )?publication|responsable de (?:la )?publication|g[ée]rant(?:e)?|pr[ée]sident(?:e)?|propri[ée]taire|[ée]diteur du site)\s*(?:du site)?\s*[:\-–]\s*(?:M\.|Mme|Monsieur|Madame)?\s*([A-ZÀ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-Ý][\p{L}'’-]+){0,3})/iu;

const SIRET_PATTERN = /siret\s*[:\-–]?\s*((?:\d[\s.]?){14})/i;
const SIREN_PATTERN = /siren\s*[:\-–]?\s*((?:\d[\s.]?){9})/i;

export type LegalNotice = {
  url: string;
  dirigeantName: string | null;
  dirigeantRole: string | null;
  siret: string | null;
  siren: string | null;
};

/** Trouve la page de mentions légales : lien explicite, sinon chemins usuels. */
export async function findLegalNotice(
  siteUrl: string,
  homepageHtml?: string,
): Promise<LegalNotice | null> {
  const origin = safeOrigin(siteUrl);
  if (!origin) return null;

  const candidates: string[] = [];

  if (homepageHtml) {
    const $ = cheerio.load(homepageHtml);
    $("a[href]").each((_, el) => {
      const text = $(el).text().toLowerCase();
      const href = $(el).attr("href") ?? "";
      if (/mentions|l[ée]gales|legal/i.test(`${text} ${href}`)) {
        try {
          candidates.push(new URL(href, siteUrl).toString());
        } catch {
          /* lien inexploitable */
        }
      }
    });
  }
  candidates.push(...CANDIDATE_PATHS.map((p) => `${origin}${p}`));

  for (const url of dedupe(candidates).slice(0, 4)) {
    const page = await fetchPage(url);
    if (isDead(page)) continue;
    const parsed = parseLegalNotice(page.html);
    if (parsed.dirigeantName || parsed.siret || parsed.siren) {
      return { url, ...parsed };
    }
  }
  return null;
}

/**
 * Les mentions légales sont une suite de lignes courtes. On préserve donc les
 * frontières de blocs avant d'extraire le texte : sans cela, « Gérant : Yann
 * Le Gall » suivi de « SIRET : … » se lit comme un seul nom.
 */
function toLines(html: string): string[] {
  const withBreaks = html.replace(
    /<\s*(br|\/p|\/div|\/li|\/tr|\/td|\/h[1-6]|\/address|\/section)\b[^>]*>/gi,
    "\n$&",
  );
  return cheerio
    .load(withBreaks)
    .root()
    .text()
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter(Boolean);
}

/** Sigles administratifs qu'une regex de nom propre attraperait à tort. */
const TRAILING_ACRONYM = /\s+(SIRET|SIREN|RCS|TVA|APE|NAF|SAS|SARL|SA|EURL|SCI)$/i;

export function parseLegalNotice(html: string): Omit<LegalNotice, "url"> {
  const lines = toLines(html);
  const flat = lines.join(" ");

  let dirigeantName: string | null = null;
  let dirigeantRole: string | null = null;
  for (const line of lines) {
    const match = ROLE_PATTERN.exec(line);
    if (!match) continue;
    dirigeantName = match[2].trim().replace(TRAILING_ACRONYM, "").trim();
    dirigeantRole = capitalize(match[1]);
    break;
  }

  const siret = SIRET_PATTERN.exec(flat)?.[1]?.replace(/\D/g, "") ?? null;
  const siren = SIREN_PATTERN.exec(flat)?.[1]?.replace(/\D/g, "") ?? null;

  return {
    dirigeantName: dirigeantName || null,
    dirigeantRole: dirigeantName ? dirigeantRole : null,
    siret: siret?.length === 14 ? siret : null,
    siren: siren?.length === 9 ? siren : siret ? siret.slice(0, 9) : null,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
