import { TIER_LABEL } from "./scoring";
import type { ProspectDetail } from "./types";

/**
 * Brief commercial en Markdown, assemblé par gabarit à partir des données
 * structurées — aucun LLM. Il doit pouvoir être lu tel quel avant un
 * rendez-vous : identité, interlocuteur, diagnostic chiffré, arguments.
 *
 * Les recommandations sont conditionnées aux signaux réellement détectés :
 * on ne propose jamais de corriger quelque chose qui va déjà bien.
 */

/** Une recommandation par clé de critère du barème. */
const RECOMMENDATIONS: Record<string, string> = {
  "base.noSite":
    "Proposer un site vitrine complet : c'est une création, pas une refonte. Argument d'entrée : les concurrents équipés captent les recherches « <métier> + <ville> » que l'entreprise ne voit jamais passer.",
  "defect.noViewport":
    "Refonte responsive en priorité absolue : sur ce type d'activité, la majorité des visites viennent du mobile. Montrer le site sur son propre téléphone pendant le rendez-vous.",
  "defect.noHttps":
    "Installer un certificat TLS (gratuit via Let's Encrypt) et forcer la redirection. Faire constater l'avertissement « Non sécurisé » du navigateur.",
  "defect.outdatedTech":
    "Reconstruire sur une base maintenue. Insister sur le risque : un CMS non mis à jour est la première porte d'entrée des piratages de sites vitrines.",
  "defect.seo":
    "Reprendre les balises de base (title, meta description, h1) et publier sitemap.xml + robots.txt. Chiffrage rapide, effet mesurable sur les recherches locales.",
  "defect.freeBuilder":
    "Sortir du constructeur gratuit : image générique, dépendance à la plateforme, référencement bridé. Proposer la reprise du contenu existant pour limiter le coût.",
  "defect.copyrightStale":
    "Le site donne l'impression d'une entreprise à l'arrêt. Argument fort auprès d'un dirigeant qui, lui, sait que son activité tourne.",
  "defect.noContactForm":
    "Ajouter un formulaire de demande de devis : c'est le seul élément du site qui produit directement des contacts entrants, y compris hors horaires d'ouverture.",
  "defect.heavyOrSlow":
    "Optimiser le poids des images et l'hébergement. À présenter en temps de chargement mesuré, pas en mégaoctets.",
  "defect.noOpenGraph":
    "Ajouter les balises Open Graph : aujourd'hui, un lien partagé sur Facebook ou WhatsApp s'affiche sans titre ni image.",
  "defect.noAnalytics":
    "Installer une mesure d'audience respectueuse du RGPD (Plausible, Matomo). Permet de démontrer le retour sur investissement de la refonte trois mois plus tard.",
  "defect.noFavicon":
    "Détail à corriger d'office dans la refonte : icône d'onglet et de favori.",
  "defect.noSocials":
    "Relier le site aux pages sociales existantes, ou en créer si l'activité s'y prête (restauration, coiffure, métiers visuels).",
};

const ANGLE: Record<string, string> = {
  "bonus.reviews20":
    "L'établissement est déjà cherché en ligne : la demande existe, seule la vitrine manque.",
  "bonus.reviews50":
    "Audience suffisante pour rentabiliser rapidement une refonte.",
  "bonus.rating40":
    "La qualité perçue est excellente — le site ne lui rend pas justice.",
};

export function buildBrief(prospect: ProspectDetail): string {
  const { analysis, enrichment } = prospect;
  const lines: string[] = [];
  const push = (...text: string[]) => lines.push(...text);

  push(`# ${prospect.name}`, "");
  push(
    `**Score d'opportunité : ${prospect.score ?? "—"}/100**` +
      (prospect.tier ? ` — ${TIER_LABEL[prospect.tier]}` : ""),
    "",
  );

  // ---------------------------------------------------------------- Identité
  push("## Identité", "");
  push(...facts([
    ["Secteur", prospect.sectorLabel],
    ["Adresse", prospect.address],
    ["Téléphone", prospect.phone],
    ["Site web", prospect.websiteUrl ?? "aucun site référencé"],
    [
      "Réputation Google",
      prospect.rating !== null
        ? `${prospect.rating.toFixed(1)}/5 sur ${prospect.reviewCount ?? 0} avis`
        : null,
    ],
  ]));
  push("");

  // -------------------------------------------------------------- Dirigeant
  push("## Interlocuteur", "");
  if (enrichment?.dirigeantName) {
    push(...facts([
      [
        "Dirigeant",
        `${enrichment.dirigeantName}${enrichment.dirigeantRole ? ` (${enrichment.dirigeantRole})` : ""}`,
      ],
      [
        "Source",
        enrichment.dirigeantSource === "gouv"
          ? "annuaire des entreprises (data.gouv.fr)"
          : "mentions légales du site",
      ],
      ["SIREN", enrichment.siren],
      ["SIRET", enrichment.siret],
      ["Forme juridique", enrichment.legalForm],
      [
        "Activité",
        enrichment.naf
          ? `${enrichment.naf}${enrichment.nafLabel ? ` — ${enrichment.nafLabel}` : ""}`
          : null,
      ],
      ["Création", enrichment.creationDate],
    ]));
  } else {
    push(
      "_Non identifié._ Lancer l'enrichissement depuis la fiche, ou appeler en demandant « le responsable » à l'accueil.",
    );
  }
  push("");

  // -------------------------------------------------------------- Diagnostic
  push("## Diagnostic", "");
  if (prospect.breakdown.length === 0) {
    push("Aucun défaut relevé : ce prospect n'a pas de besoin de refonte.", "");
  } else {
    push("| Critère | Points | Constat |", "| --- | ---: | --- |");
    for (const line of prospect.breakdown) {
      const sign = line.key.startsWith("bonus.") ? "+" : "";
      push(`| ${line.label} | ${sign}${line.points} | ${escapeCell(line.note)} |`);
    }
    push("", `**Total : ${prospect.score}/100**`, "");
  }

  if (analysis) {
    push("### État technique du site", "");
    if (!analysis.reachable) {
      push(
        `Le site annoncé (${analysis.url}) ne répond pas : ${analysis.failureReason ?? "injoignable"}.`,
        "",
        "À vérifier avant l'appel : nom de domaine expiré, hébergement coupé, ou simple erreur dans la fiche Google. Chacun de ces cas ouvre une conversation différente.",
        "",
      );
    } else {
      push(...facts([
        [
          "Technologie",
          analysis.cms
            ? `${analysis.cms}${analysis.cmsVersion ? ` ${analysis.cmsVersion}` : ""}`
            : "non identifiée",
        ],
        ["Poids de la page d'accueil", `${analysis.pageWeightKb} Ko`],
        ["Temps de réponse", `${analysis.fetchMs} ms`],
        ["Copyright affiché", analysis.copyrightYear?.toString() ?? null],
        [
          "Pages analysées",
          analysis.pagesFetched.length
            ? analysis.pagesFetched.join(", ")
            : null,
        ],
      ]));
      push("");
    }
  }

  // ------------------------------------------------------- Activité, palette
  if (enrichment?.services.length) {
    push("## Prestations affichées", "");
    for (const service of enrichment.services) push(`- ${service}`);
    push("", "_Déduit de la navigation et des titres du site : à confirmer au téléphone._", "");
  }

  if (enrichment?.colors.length) {
    push("## Couleurs du site actuel", "");
    push(enrichment.colors.map((c) => `\`${c.hex}\``).join(" · "));
    push("", "_Point de départ pour la nouvelle charte : « on repart de vos couleurs »._", "");
  }

  if (enrichment?.socials.length || analysis?.socials.length) {
    const socials = enrichment?.socials.length
      ? enrichment.socials
      : (analysis?.socials ?? []);
    push("## Présence sociale", "");
    for (const url of socials) push(`- ${url}`);
    push("");
  }

  // --------------------------------------------------------- Recommandations
  push("## Recommandations", "");
  const recommendations = prospect.breakdown
    .map((line) => RECOMMENDATIONS[line.key])
    .filter((text): text is string => Boolean(text));

  if (recommendations.length === 0) {
    push("Rien à proposer sur ce prospect.", "");
  } else {
    for (const [index, text] of recommendations.entries()) {
      push(`${index + 1}. ${personalize(text, prospect)}`);
    }
    push("");
  }

  const angles = prospect.breakdown
    .map((line) => ANGLE[line.key])
    .filter((text): text is string => Boolean(text));
  if (angles.length > 0) {
    push("### Angle d'attaque", "");
    for (const angle of angles) push(`- ${angle}`);
    push("");
  }

  push("---", "");
  push(
    `_Brief généré le ${new Date().toLocaleDateString("fr-FR")} par Opportunity. ` +
      `Diagnostic automatique à vérifier avant le rendez-vous._`,
  );

  return lines.join("\n");
}

/**
 * Réunit les briefs d'un balayage entier en un seul Markdown : on emporte le
 * balayage complet plutôt que d'exporter une fiche à la fois. Les prospects non
 * notés et les refus de démarchage sont écartés, le reste est trié par score
 * décroissant, précédé d'un sommaire.
 */
export function buildSweepBrief(
  label: string,
  prospects: ProspectDetail[],
): string {
  const briefable = prospects
    .filter((p) => !p.optOut && p.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const lines: string[] = [];
  lines.push(`# Briefs — ${label}`, "");
  lines.push(
    `_${briefable.length} prospect${briefable.length > 1 ? "s" : ""} à contacter · ` +
      `généré le ${new Date().toLocaleDateString("fr-FR")} par Opportunity._`,
    "",
  );

  if (briefable.length === 0) {
    lines.push("Aucun prospect à briefer pour ce balayage.", "");
    return lines.join("\n");
  }

  lines.push("## Sommaire", "");
  briefable.forEach((prospect, index) => {
    lines.push(`${index + 1}. ${prospect.name} — ${prospect.score}/100`);
  });
  lines.push("");

  for (const prospect of briefable) {
    lines.push("---", "", buildBrief(prospect), "");
  }

  return lines.join("\n");
}

/** Nom de fichier proposé pour l'export d'un balayage entier. */
export function sweepBriefFilename(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const date = new Date().toISOString().slice(0, 10);
  return `briefs-${slug || "balayage"}-${date}.md`;
}

/** Remplace les tokens du gabarit par les données du prospect. */
function personalize(text: string, prospect: ProspectDetail): string {
  const city = /(\d{5})\s+([^,]+)/.exec(prospect.address ?? "")?.[2]?.trim();
  return text
    .replace("<métier>", prospect.sectorLabel.toLowerCase())
    .replace("<ville>", city ?? "la ville");
}

function facts(rows: [string, string | null | undefined][]): string[] {
  return rows
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => `- **${label}** : ${value}`);
}

/** Un pipe dans une note casserait le tableau Markdown. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Nom de fichier proposé au téléchargement. */
export function briefFilename(prospect: ProspectDetail): string {
  const slug = prospect.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `brief-${slug || prospect.id}.md`;
}
