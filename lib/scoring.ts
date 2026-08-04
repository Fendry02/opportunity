/**
 * Sous-ensemble des signaux dont dépend réellement le score.
 *
 * Déclaré à part de `SiteSignals` pour que le score puisse aussi être
 * recalculé à partir d'une analyse **relue en base**, sans refetcher le site.
 * `SiteSignals` le satisfait structurellement.
 */
export type ScoreSignals = {
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
  outdatedTech: string[];
  freeBuilder: string | null;
  copyrightYear: number | null;
  pageWeightKb: number | null;
  fetchMs: number | null;
};

/**
 * Score d'opportunité 0-100 : « à quel point cette entreprise gagnerait à
 * refaire son site, et à quel point elle vaut le démarchage ».
 *
 * C'est le seul fichier à toucher pour ajuster le classement. Le détail
 * (`breakdown`) est repris tel quel dans la fiche et dans le brief : chaque
 * point attribué doit donc être justifiable devant le prospect.
 */

export type ScoreLine = {
  /** Identifiant stable, utilisé pour brancher les recommandations du brief. */
  key: string;
  label: string;
  points: number;
  /** Phrase affichée telle quelle dans la fiche et le brief. */
  note: string;
};

export type Score = {
  total: number;
  breakdown: ScoreLine[];
};

/** Défauts d'un site existant — 85 points au maximum. */
export const DEFECT_WEIGHTS = {
  noViewport: 14,
  noHttps: 12,
  outdatedTech: 10,
  seo: 9, // title 2 · meta description 2 · h1 2 · sitemap 2 · robots 1
  freeBuilder: 8,
  copyrightStale: 7,
  noContactForm: 6,
  heavyOrSlow: 5,
  noOpenGraph: 4,
  noAnalytics: 4,
  noFavicon: 3,
  noSocials: 3,
} as const;

export const SEO_WEIGHTS = {
  title: 2,
  metaDesc: 2,
  h1: 2,
  sitemap: 2,
  robots: 1,
} as const;

/** Bonus d'attractivité — 15 points au maximum. */
export const BONUS_WEIGHTS = {
  reviews20: 5,
  reviews50: 3,
  rating40: 4,
  phone: 3,
} as const;

export const NO_SITE_BASE = 80;
export const MAX_DEFECTS = 85;
export const MAX_BONUS = 15;

/** Seuils au-delà desquels une page est jugée trop lourde ou trop lente. */
export const HEAVY_PAGE_KB = 3 * 1024;
export const SLOW_PAGE_MS = 5000;
/** Retard du copyright, en années, à partir duquel le site paraît abandonné. */
export const STALE_COPYRIGHT_YEARS = 3;

export type ScoreInput = {
  /** Absent, vide ou site injoignable ⇒ traité comme « sans site ». */
  signals: ScoreSignals | null;
  rating?: number | null;
  reviewCount?: number | null;
  phone?: string | null;
  /** Année de référence (injectable pour les tests). */
  currentYear?: number;
};

function bonusLines(input: ScoreInput): ScoreLine[] {
  const lines: ScoreLine[] = [];
  const reviews = input.reviewCount ?? 0;

  if (reviews >= 20) {
    lines.push({
      key: "bonus.reviews20",
      label: "Visibilité Google",
      points: BONUS_WEIGHTS.reviews20,
      note: `${reviews} avis Google : l'établissement est déjà cherché en ligne.`,
    });
  }
  if (reviews >= 50) {
    lines.push({
      key: "bonus.reviews50",
      label: "Forte notoriété locale",
      points: BONUS_WEIGHTS.reviews50,
      note: `Plus de 50 avis : audience suffisante pour rentabiliser un site.`,
    });
  }
  if ((input.rating ?? 0) >= 4.0) {
    lines.push({
      key: "bonus.rating40",
      label: "Bonne réputation",
      points: BONUS_WEIGHTS.rating40,
      note: `Note de ${input.rating?.toFixed(1)}/5 : la qualité est là, la vitrine ne suit pas.`,
    });
  }
  if (input.phone) {
    lines.push({
      key: "bonus.phone",
      label: "Joignable directement",
      points: BONUS_WEIGHTS.phone,
      note: "Téléphone public : prise de contact immédiate possible.",
    });
  }

  return capLines(lines, MAX_BONUS);
}

/** Rogne les points de la dernière ligne pour respecter un plafond. */
function capLines(lines: ScoreLine[], max: number): ScoreLine[] {
  let running = 0;
  const out: ScoreLine[] = [];
  for (const line of lines) {
    if (running >= max) break;
    const points = Math.min(line.points, max - running);
    running += points;
    out.push(points === line.points ? line : { ...line, points });
  }
  return out;
}

function defectLines(s: ScoreSignals, currentYear: number): ScoreLine[] {
  const lines: ScoreLine[] = [];

  if (!s.hasViewport) {
    lines.push({
      key: "defect.noViewport",
      label: "Pas adapté au mobile",
      points: DEFECT_WEIGHTS.noViewport,
      note: "Aucune balise viewport : le site s'affiche en version bureau sur téléphone, illisible pour la majorité des visiteurs.",
    });
  }
  if (!s.https) {
    lines.push({
      key: "defect.noHttps",
      label: "Pas de HTTPS",
      points: DEFECT_WEIGHTS.noHttps,
      note: "Connexion non chiffrée : les navigateurs affichent « Non sécurisé » et Google déclasse la page.",
    });
  }
  if (s.outdatedTech.length > 0) {
    lines.push({
      key: "defect.outdatedTech",
      label: "Technologie obsolète",
      points: DEFECT_WEIGHTS.outdatedTech,
      note: `Détecté : ${s.outdatedTech.join(" ; ")}.`,
    });
  }

  const seo = seoLine(s);
  if (seo) lines.push(seo);

  if (s.freeBuilder) {
    lines.push({
      key: "defect.freeBuilder",
      label: "Constructeur gratuit",
      points: DEFECT_WEIGHTS.freeBuilder,
      note: `Site bâti sur ${s.freeBuilder} : image générique, personnalisation et référencement limités.`,
    });
  }
  if (
    s.copyrightYear !== null &&
    currentYear - s.copyrightYear >= STALE_COPYRIGHT_YEARS
  ) {
    lines.push({
      key: "defect.copyrightStale",
      label: "Site visiblement abandonné",
      points: DEFECT_WEIGHTS.copyrightStale,
      note: `Le pied de page affiche encore ${s.copyrightYear} : ${currentYear - s.copyrightYear} ans sans mise à jour visible.`,
    });
  }
  if (!s.hasContactForm) {
    lines.push({
      key: "defect.noContactForm",
      label: "Pas de formulaire de contact",
      points: DEFECT_WEIGHTS.noContactForm,
      note: "Aucun moyen de laisser une demande depuis le site : les prospects du soir et du week-end sont perdus.",
    });
  }
  const weightKb = s.pageWeightKb ?? 0;
  const fetchMs = s.fetchMs ?? 0;
  if (weightKb > HEAVY_PAGE_KB || fetchMs > SLOW_PAGE_MS) {
    lines.push({
      key: "defect.heavyOrSlow",
      label: "Page lourde ou lente",
      points: DEFECT_WEIGHTS.heavyOrSlow,
      note:
        weightKb > HEAVY_PAGE_KB
          ? `Page d'accueil de ${(weightKb / 1024).toFixed(1)} Mo.`
          : `Page d'accueil servie en ${(fetchMs / 1000).toFixed(1)} s.`,
    });
  }
  if (!s.hasOgTags) {
    lines.push({
      key: "defect.noOpenGraph",
      label: "Pas de balises Open Graph",
      points: DEFECT_WEIGHTS.noOpenGraph,
      note: "Partagé sur Facebook ou WhatsApp, le lien s'affiche sans titre ni image.",
    });
  }
  if (!s.hasAnalytics) {
    lines.push({
      key: "defect.noAnalytics",
      label: "Pas de mesure d'audience",
      points: DEFECT_WEIGHTS.noAnalytics,
      note: "Aucun outil de statistiques : impossible de savoir ce que le site rapporte.",
    });
  }
  if (!s.hasFavicon) {
    lines.push({
      key: "defect.noFavicon",
      label: "Pas de favicon",
      points: DEFECT_WEIGHTS.noFavicon,
      note: "Onglet et favoris affichent une icône vide : détail visible, effet amateur.",
    });
  }
  if (!s.hasSocials) {
    lines.push({
      key: "defect.noSocials",
      label: "Pas de réseaux sociaux",
      points: DEFECT_WEIGHTS.noSocials,
      note: "Aucun lien vers un réseau social depuis le site.",
    });
  }

  return capLines(lines, MAX_DEFECTS);
}

function seoLine(s: ScoreSignals): ScoreLine | null {
  const missing: string[] = [];
  let points = 0;
  if (!s.hasTitle) {
    points += SEO_WEIGHTS.title;
    missing.push("balise title");
  }
  if (!s.hasMetaDesc) {
    points += SEO_WEIGHTS.metaDesc;
    missing.push("meta description");
  }
  if (!s.hasH1) {
    points += SEO_WEIGHTS.h1;
    missing.push("titre h1");
  }
  if (!s.hasSitemap) {
    points += SEO_WEIGHTS.sitemap;
    missing.push("sitemap.xml");
  }
  if (!s.hasRobots) {
    points += SEO_WEIGHTS.robots;
    missing.push("robots.txt");
  }
  if (points === 0) return null;

  return {
    key: "defect.seo",
    label: "Référencement incomplet",
    points,
    note: `Éléments manquants : ${missing.join(", ")}.`,
  };
}

export function computeScore(input: ScoreInput): Score {
  const currentYear = input.currentYear ?? new Date().getFullYear();
  const s = input.signals;
  const bonuses = bonusLines(input);

  // Sans site ou site mort : la base est haute — c'est le meilleur profil de
  // prospect, il n'y a rien à défendre en face.
  if (!s || !s.reachable) {
    const base: ScoreLine = {
      key: "base.noSite",
      label: s ? "Site injoignable" : "Aucun site web",
      points: NO_SITE_BASE,
      note: s
        ? `Le site annoncé ne répond pas (${s.failureReason ?? "injoignable"}) : l'entreprise est invisible en ligne.`
        : "Aucun site web renseigné sur la fiche Google : tout est à construire.",
    };
    const breakdown = [base, ...bonuses];
    return { total: clamp(sum(breakdown)), breakdown };
  }

  const breakdown = [...defectLines(s, currentYear), ...bonuses];
  return { total: clamp(sum(breakdown)), breakdown };
}

const sum = (lines: ScoreLine[]) => lines.reduce((n, l) => n + l.points, 0);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export type ScoreTier = "high" | "mid" | "low" | "none";

/** Palier utilisé par les badges et les pins de la carte. */
export function scoreTier(total: number): ScoreTier {
  if (total >= 70) return "high";
  if (total >= 45) return "mid";
  if (total >= 25) return "low";
  return "none";
}

export const TIER_COLOR: Record<ScoreTier, string> = {
  high: "#dc2626",
  mid: "#ea580c",
  low: "#ca8a04",
  none: "#9ca3af",
};

export const TIER_LABEL: Record<ScoreTier, string> = {
  high: "Prioritaire",
  mid: "À traiter",
  low: "Secondaire",
  none: "Peu d'intérêt",
};
