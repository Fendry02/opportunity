import type { SiteAnalysisView } from "@/lib/types";

/**
 * Checklist des signaux, en deux colonnes.
 * ✓ vert discret quand c'est en place, ✗ rouge quand ça manque.
 */

type Check = { label: string; ok: boolean; detail?: string | null };

export function SignalChecklist({ analysis }: { analysis: SiteAnalysisView }) {
  const checks: Check[] = [
    { label: "HTTPS", ok: analysis.https },
    { label: "Affichage mobile (viewport)", ok: analysis.hasViewport },
    { label: "Balise title", ok: analysis.hasTitle, detail: analysis.title },
    { label: "Meta description", ok: analysis.hasMetaDesc },
    { label: "Titre h1", ok: analysis.hasH1 },
    { label: "sitemap.xml", ok: analysis.hasSitemap },
    { label: "robots.txt", ok: analysis.hasRobots },
    { label: "Formulaire de contact", ok: analysis.hasContactForm },
    { label: "Balises Open Graph", ok: analysis.hasOgTags },
    { label: "Favicon", ok: analysis.hasFavicon },
    {
      label: "Mesure d'audience",
      ok: analysis.hasAnalytics,
      detail: analysis.analyticsTools.join(", ") || null,
    },
    {
      label: "Réseaux sociaux",
      ok: analysis.hasSocials,
      detail: analysis.socials.length ? `${analysis.socials.length} lien(s)` : null,
    },
    {
      label: "Technologie à jour",
      ok: analysis.outdatedTech.length === 0,
      detail: analysis.outdatedTech.join(" ; ") || null,
    },
    {
      label: "Site sur-mesure",
      ok: !analysis.freeBuilder,
      detail: analysis.freeBuilder,
    },
  ];

  return (
    <ul className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
      {checks.map((check) => (
        <li key={check.label} className="flex items-baseline gap-2">
          <span
            aria-hidden
            className="w-3 shrink-0 text-center text-[13px] font-semibold"
            style={{ color: check.ok ? "#16a34a" : "#dc2626" }}
          >
            {check.ok ? "✓" : "✗"}
          </span>
          <span className="flex-1">
            {check.label}
            {check.detail && (
              <span className="ml-1.5 text-[12.5px] text-app-muted">
                — {check.detail}
              </span>
            )}
          </span>
          <span className="sr-only">{check.ok ? "présent" : "absent"}</span>
        </li>
      ))}
    </ul>
  );
}
