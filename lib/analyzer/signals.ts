import * as cheerio from "cheerio";
import {
  fetchPage,
  isDead,
  looksLikeRobotsTxt,
  looksLikeSitemap,
  type FetchedPage,
} from "./fetch-site";

/**
 * Extraction des signaux techniques d'un site, uniquement par fetch HTTP +
 * cheerio (aucun navigateur headless). Chaque signal doit rester explicable
 * au prospect : c'est ce qui alimente le brief commercial.
 */

export type SiteSignals = {
  url: string;
  finalUrl: string;
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
  pageWeightKb: number;
  fetchMs: number;

  /** Détails conservés pour la fiche, le brief et l'enrichissement. */
  title: string | null;
  metaDescription: string | null;
  analyticsTools: string[];
  socials: string[];
  navLabels: string[];
  headings: string[];
  pagesFetched: string[];
  cssUrls: string[];
  inlineColors: string[];
};

const INTERNAL_PAGE_PATTERN = /contact|service|prestation|about|qui-sommes/i;
const MAX_INTERNAL_PAGES = 3;
const CURRENT_YEAR = new Date().getFullYear();

const SOCIAL_HOSTS =
  /(facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|pinterest\.)/i;

const ANALYTICS_PATTERNS: [RegExp, string][] = [
  [/googletagmanager\.com\/gtag|gtag\(/i, "Google Analytics 4"],
  [/googletagmanager\.com\/gtm|GTM-[A-Z0-9]+/i, "Google Tag Manager"],
  [/google-analytics\.com\/(analytics|ga)\.js|UA-\d{4,}-\d+/i, "Universal Analytics"],
  [/matomo\.js|piwik\.js|_paq\.push/i, "Matomo"],
  [/plausible\.io\/js/i, "Plausible"],
  [/umami\.(js|is)/i, "Umami"],
  [/static\.hotjar\.com/i, "Hotjar"],
  [/clarity\.ms/i, "Microsoft Clarity"],
];

/** Constructeurs de sites gratuits : signal commercial fort. */
const FREE_BUILDERS: [RegExp, string][] = [
  [/wix\.com|parastorage\.com|wixstatic\.com/i, "Wix"],
  [/e-monsite\.com/i, "e-monsite"],
  [/jimdo\.com|jimdofree|jimstatic\.com/i, "Jimdo"],
  [/pagesperso-orange\.fr|perso\.wanadoo\.fr/i, "Pages perso Orange"],
  [/sitew\.com/i, "SiteW"],
  [/webself\.net/i, "WebSelf"],
];

const CMS_PATTERNS: [RegExp, string][] = [
  [/wp-content|wp-includes|wordpress/i, "WordPress"],
  [/joomla/i, "Joomla"],
  [/drupal/i, "Drupal"],
  [/prestashop/i, "PrestaShop"],
  [/shopify/i, "Shopify"],
  [/squarespace/i, "Squarespace"],
  [/webflow/i, "Webflow"],
  [/typo3/i, "TYPO3"],
];

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

/** Une page Facebook tient parfois lieu de site : ce n'est pas un site. */
function isFacebookPage(url: string): boolean {
  return /(^|\.)facebook\.com/i.test(safeHost(url));
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function pickInternalPages(homepage: FetchedPage): string[] {
  const $ = cheerio.load(homepage.html);
  const base = homepage.finalUrl;
  const host = safeHost(base);
  const found = new Map<string, string>();

  $("a[href]").each((_, el) => {
    if (found.size >= MAX_INTERNAL_PAGES * 3) return;
    const href = $(el).attr("href");
    if (!href || /^(mailto|tel|javascript):/i.test(href)) return;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      return;
    }
    if (abs.hostname !== host) return;
    if (!INTERNAL_PAGE_PATTERN.test(abs.pathname)) return;
    abs.hash = "";
    const key = abs.toString();
    if (key === base) return;
    if (!found.has(key)) found.set(key, key);
  });

  return [...found.keys()].slice(0, MAX_INTERNAL_PAGES);
}

function detectJQueryVersion(html: string): string | null {
  const patterns = [
    /jquery[.-]v?(\d+)\.(\d+)(?:\.(\d+))?(?:\.min)?\.js/i,
    /jquery\/(\d+)\.(\d+)(?:\.(\d+))?\//i,
    /jquery\?ver=(\d+)\.(\d+)(?:\.(\d+))?/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return [m[1], m[2], m[3] ?? "0"].join(".");
  }
  return null;
}

/** Un layout en tableaux + balises `<font>` date d'avant 2005. */
function looksLikeTableLayout($: cheerio.CheerioAPI): boolean {
  const tables = $("table");
  if (tables.length === 0) return false;
  // Un vrai tableau de données a des en-têtes ; un tableau de mise en page, non.
  const dataTables = $("table").filter((_, el) => $(el).find("th").length > 0);
  if (dataTables.length === tables.length) return false;

  const nested = $("table table").length > 0;
  const legacyAttrs = $(
    "table[cellpadding], table[cellspacing], table[bgcolor], td[bgcolor], td[valign], table[width]",
  ).length;
  const fontTags = $("font").length > 0;
  return nested || fontTags || legacyAttrs >= 2;
}

function detectFlash($: cheerio.CheerioAPI, html: string): boolean {
  return (
    $('embed[type*="shockwave"], object[type*="shockwave"]').length > 0 ||
    /\.swf\b/i.test(html) ||
    /classid=["']clsid:D27CDB6E/i.test(html)
  );
}

function extractCopyrightYear(text: string): number | null {
  const re = /(?:©|copyright|\(c\))\D{0,20}(\d{4})/gi;
  let best: number | null = null;
  for (const m of text.matchAll(re)) {
    const year = Number(m[1]);
    if (year >= 1990 && year <= CURRENT_YEAR + 1) {
      best = best === null ? year : Math.max(best, year);
    }
  }
  return best;
}

function extractInlineColors($: cheerio.CheerioAPI): string[] {
  const out: string[] = [];
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    for (const m of style.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]+\)/gi)) {
      out.push(m[0]);
    }
  });
  $("[bgcolor], [color], [text]").each((_, el) => {
    for (const attr of ["bgcolor", "color", "text"]) {
      const v = $(el).attr(attr);
      if (v) out.push(v);
    }
  });
  return out;
}

function stopwordFiltered(labels: string[]): string[] {
  const stop =
    /^(accueil|home|contact|contactez|mentions|plan du site|blog|actualit|panier|connexion|mon compte|rechercher|newsletter|cookies|cgv|cgu|f\.?a\.?q)/i;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.replace(/\s+/g, " ").trim();
    if (label.length < 3 || label.length > 60) continue;
    if (stop.test(label)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

function emptySignals(url: string, reason: string): SiteSignals {
  return {
    url,
    finalUrl: url,
    reachable: false,
    failureReason: reason,
    https: /^https:/i.test(url),
    hasViewport: false,
    hasTitle: false,
    hasMetaDesc: false,
    hasH1: false,
    hasSitemap: false,
    hasRobots: false,
    hasContactForm: false,
    hasOgTags: false,
    hasFavicon: false,
    hasAnalytics: false,
    hasSocials: false,
    cms: null,
    cmsVersion: null,
    outdatedTech: [],
    freeBuilder: null,
    copyrightYear: null,
    pageWeightKb: 0,
    fetchMs: 0,
    title: null,
    metaDescription: null,
    analyticsTools: [],
    socials: [],
    navLabels: [],
    headings: [],
    pagesFetched: [],
    cssUrls: [],
    inlineColors: [],
  };
}

/**
 * Analyse complète : page d'accueil + jusqu'à 3 pages internes pertinentes +
 * robots.txt + sitemap.xml.
 */
export async function analyzeSite(rawUrl: string): Promise<SiteSignals> {
  const url = normalizeUrl(rawUrl);
  if (!url) return emptySignals(rawUrl, "URL invalide");

  // Facebook bloque les robots : inutile d'essayer. Une page FB en guise de
  // site se traite comme un « builder gratuit » dépourvu de tout le reste.
  if (isFacebookPage(url)) {
    return {
      ...emptySignals(url, "page Facebook (aucun site propre)"),
      reachable: true,
      https: true,
      freeBuilder: "Page Facebook",
    };
  }

  let homepage = await fetchPage(url);
  // Un https cassé mérite un essai en http avant de conclure au site mort :
  // beaucoup de vieux sites n'ont tout simplement pas de certificat.
  if (isDead(homepage) && url.startsWith("https://")) {
    const httpTry = await fetchPage(url.replace(/^https:/, "http:"));
    if (!isDead(httpTry)) homepage = httpTry;
  }

  if (isDead(homepage)) {
    const reason =
      homepage.error ??
      (homepage.status >= 400
        ? `le serveur répond ${homepage.status}`
        : "page vide");
    return emptySignals(url, reason);
  }

  const internalUrls = pickInternalPages(homepage);
  const origin = new URL(homepage.finalUrl).origin;

  const [internalPages, robots, sitemap] = await Promise.all([
    Promise.all(internalUrls.map(fetchPage)),
    fetchPage(`${origin}/robots.txt`),
    fetchPage(`${origin}/sitemap.xml`),
  ]);

  const pages = [homepage, ...internalPages.filter((p) => !isDead(p))];
  const signals = buildSignals(url, homepage, pages);

  signals.hasRobots = looksLikeRobotsTxt(robots);
  signals.hasSitemap =
    looksLikeSitemap(sitemap) || /^\s*sitemap\s*:/im.test(robots.html);

  if (!signals.hasFavicon) {
    const favicon = await fetchPage(`${origin}/favicon.ico`);
    signals.hasFavicon =
      favicon.status === 200 && favicon.bytes > 0;
  }

  return signals;
}

/** Partie purement synchrone : testable sans réseau. */
function buildSignals(
  requestedUrl: string,
  homepage: FetchedPage,
  pages: FetchedPage[],
): SiteSignals {
  const $ = cheerio.load(homepage.html);
  const html = homepage.html;
  const allHtml = pages.map((p) => p.html).join("\n");

  const title = $("title").first().text().trim() || null;
  const metaDesc =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;

  const generator = $('meta[name="generator"]').attr("content") ?? "";

  const freeBuilder =
    FREE_BUILDERS.find(([re]) => re.test(generator) || re.test(html))?.[1] ??
    null;

  let cms: string | null = freeBuilder;
  let cmsVersion: string | null = null;
  if (!cms) {
    cms = CMS_PATTERNS.find(([re]) => re.test(generator) || re.test(html))?.[1] ?? null;
  }
  const generatorVersion = /(\d+(?:\.\d+)+)/.exec(generator)?.[1] ?? null;
  if (cms) cmsVersion = generatorVersion ?? /[?&]ver=(\d+(?:\.\d+)+)/.exec(html)?.[1] ?? null;

  const outdatedTech: string[] = [];
  const wpMajor = cms === "WordPress" && cmsVersion ? Number(cmsVersion.split(".")[0]) : null;
  if (wpMajor !== null && wpMajor < 5) {
    outdatedTech.push(`WordPress ${cmsVersion} (obsolète, non maintenu)`);
  }
  const jq = detectJQueryVersion(allHtml);
  if (jq && Number(jq.split(".")[0]) < 2) {
    outdatedTech.push(`jQuery ${jq} (version de 2013 ou antérieure)`);
  }
  if (looksLikeTableLayout($)) {
    outdatedTech.push("Mise en page en tableaux HTML");
  }
  if (detectFlash($, allHtml)) {
    outdatedTech.push("Contenu Flash (plus lu par aucun navigateur)");
  }

  const analyticsTools = ANALYTICS_PATTERNS.filter(([re]) => re.test(allHtml)).map(
    ([, name]) => name,
  );

  const socials = new Set<string>();
  for (const page of pages) {
    const $p = cheerio.load(page.html);
    $p("a[href]").each((_, el) => {
      const href = $p(el).attr("href") ?? "";
      if (SOCIAL_HOSTS.test(href)) socials.add(href.split("?")[0]);
    });
  }

  const hasContactForm = pages.some((page) => {
    const $p = cheerio.load(page.html);
    return (
      $p('form input[type="email"], form textarea').length > 0 ||
      $p('form[action*="contact"], form[action*="devis"], form[action*="reservation"]')
        .length > 0
    );
  });

  const navLabels: string[] = [];
  $("nav a, header a, .menu a, #menu a").each((_, el) => {
    navLabels.push($(el).text());
  });

  const headings: string[] = [];
  for (const page of pages) {
    const $p = cheerio.load(page.html);
    $p("h2, h3").each((_, el) => {
      headings.push($p(el).text());
    });
  }

  const cssUrls: string[] = [];
  $('link[rel="stylesheet"][href]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      cssUrls.push(new URL(href, homepage.finalUrl).toString());
    } catch {
      /* href inexploitable */
    }
  });

  const viewport = $('meta[name="viewport"]').attr("content") ?? "";

  return {
    url: requestedUrl,
    finalUrl: homepage.finalUrl,
    reachable: true,
    failureReason: null,

    https: homepage.finalUrl.startsWith("https://"),
    hasViewport: /width\s*=/.test(viewport),
    hasTitle: !!title && title.length >= 3,
    hasMetaDesc: !!metaDesc && metaDesc.length >= 20,
    hasH1: $("h1").filter((_, el) => $(el).text().trim().length > 0).length > 0,
    hasSitemap: false, // renseigné par analyzeSite
    hasRobots: false, // renseigné par analyzeSite
    hasContactForm,
    hasOgTags: $('meta[property^="og:"]').length >= 2,
    hasFavicon:
      $('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
        .length > 0,
    hasAnalytics: analyticsTools.length > 0,
    hasSocials: socials.size > 0,

    cms,
    cmsVersion,
    outdatedTech,
    freeBuilder,
    copyrightYear: extractCopyrightYear($.root().text()),
    pageWeightKb: Math.round(homepage.bytes / 1024),
    fetchMs: homepage.ms,

    title,
    metaDescription: metaDesc,
    analyticsTools,
    socials: [...socials],
    navLabels: stopwordFiltered(navLabels),
    headings: stopwordFiltered(headings),
    pagesFetched: pages.map((p) => p.finalUrl),
    cssUrls,
    inlineColors: extractInlineColors($),
  };
}
