import * as cheerio from "cheerio";
import { fetchPage, isDead } from "../analyzer/fetch-site";

const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const EMAIL_VALID_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const GENERIC_LOCAL_PART = /^(?:bonjour|contact|info|accueil|commercial|devis|hello|office|service-client)$/i;
const IGNORED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "example.invalid",
  "yourdomain.com",
]);
const CANDIDATE_PATHS = [
  "/contact",
  "/contact/",
  "/nous-contacter",
  "/nous-contacter/",
  "/mentions-legales",
  "/mentions-legales/",
];

type Candidate = { email: string; score: number };

/**
 * Retient une adresse explicitement affichée par l'entreprise. Les boîtes de
 * contact génériques gagnent sur les adresses nominatives et les exemples sont
 * écartés pour ne jamais fabriquer un destinataire.
 */
export function extractPublicEmail(html: string): string | null {
  const $ = cheerio.load(html);
  const candidates: Candidate[] = [];

  $("a[href]").each((_, link) => {
    const href = $(link).attr("href") ?? "";
    if (!href.toLowerCase().startsWith("mailto:")) return;
    const email = normaliseMailto(href);
    if (email) candidates.push({ email, score: scoreEmail(email, 100) });
  });

  const visibleText = deobfuscate($("body").text() || $.root().text());
  for (const email of visibleText.match(EMAIL_PATTERN) ?? []) {
    candidates.push({ email: normaliseEmail(email), score: scoreEmail(email, 0) });
  }

  return candidates
    .filter((candidate) => isPublicEmail(candidate.email))
    .sort((left, right) => right.score - left.score || left.email.localeCompare(right.email))
    .at(0)?.email ?? null;
}

/** Cherche l'accueil, puis quelques pages de contact et mentions légales du
 * même site. Aucune source externe ni donnée privée n'est utilisée. */
export async function findPublicEmail(
  siteUrl: string,
  homepageHtml?: string,
): Promise<string | null> {
  const origin = safeOrigin(siteUrl);
  if (!origin) return null;

  const homepage = homepageHtml === undefined ? await fetchPage(siteUrl) : null;
  const html = homepageHtml ?? (homepage && !isDead(homepage) ? homepage.html : "");
  const onHomepage = extractPublicEmail(html);
  if (onHomepage) return onHomepage;

  const candidates = [
    ...contactLinks(siteUrl, html),
    ...CANDIDATE_PATHS.map((path) => `${origin}${path}`),
  ];
  for (const url of dedupe(candidates).slice(0, 4)) {
    const page = await fetchPage(url);
    if (isDead(page)) continue;
    const email = extractPublicEmail(page.html);
    if (email) return email;
  }
  return null;
}

function contactLinks(siteUrl: string, html: string): string[] {
  const origin = safeOrigin(siteUrl);
  if (!origin || !html) return [];
  const $ = cheerio.load(html);
  const links: string[] = [];
  $("a[href]").each((_, link) => {
    const href = $(link).attr("href") ?? "";
    const label = $(link).text();
    if (!/contact|contacter|joindre|mentions|l[ée]gales|legal/i.test(`${label} ${href}`)) {
      return;
    }
    try {
      const url = new URL(href, siteUrl);
      if (url.origin === origin && /^https?:$/.test(url.protocol)) links.push(url.toString());
    } catch {
      // Les liens défectueux n'empêchent pas la suite de l'enrichissement.
    }
  });
  return links;
}

function normaliseMailto(href: string): string | null {
  try {
    const value = decodeURIComponent(href.slice("mailto:".length).split("?")[0] ?? "");
    return normaliseEmail(value);
  } catch {
    return null;
  }
}

function deobfuscate(value: string): string {
  return value
    .replace(/\s*(?:\[at\]|\(at\)|\[arrobase\]|\(arrobase\))\s*/gi, "@")
    .replace(/\s*(?:\[dot\]|\(dot\))\s*/gi, ".");
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase().replace(/^mailto:/, "");
}

function isPublicEmail(email: string): boolean {
  const [local, domain] = email.split("@");
  return Boolean(
    local &&
      domain &&
      !IGNORED_DOMAINS.has(domain) &&
      !domain.endsWith(".invalid") &&
      EMAIL_VALID_PATTERN.test(email),
  );
}

function scoreEmail(email: string, base: number): number {
  const local = email.split("@", 1)[0] ?? "";
  return base + (GENERIC_LOCAL_PART.test(local) ? 50 : 0);
}

function safeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
