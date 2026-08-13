"use client";

import { useState } from "react";
import { ScoreBadge } from "./ScoreBadge";
import { SignalChecklist } from "./SignalChecklist";
import { BlockedIcon } from "./icons";
import { ApiError, fetchJson } from "@/lib/fetch-json";
import { formatDistance } from "@/lib/format";
import { TIER_LABEL } from "@/lib/scoring";
import type { ProspectDetail } from "@/lib/types";

/**
 * Contenu de la fiche prospect, sans habillage de page.
 *
 * Sert aux deux vues : la page `/prospects/[id]` et le panneau latéral ouvert
 * depuis la carte. `variant` n'ajuste que la densité — le fond est identique,
 * pour qu'on retrouve exactement la même fiche des deux côtés.
 */

export function ProspectDetailView({
  initial,
  variant = "page",
}: {
  initial: ProspectDetail;
  variant?: "page" | "panel";
}) {
  const [prospect, setProspect] = useState(initial);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enrich() {
    setEnriching(true);
    setError(null);
    try {
      const data = await fetchJson<{ prospect: ProspectDetail }>(
        `/api/prospects/${encodeURIComponent(prospect.id)}/enrich`,
        { method: "POST" },
      );
      setProspect(data.prospect);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Enrichissement impossible.",
      );
    } finally {
      setEnriching(false);
    }
  }

  const { analysis, enrichment } = prospect;
  const compact = variant === "panel";
  // La fiche est un h1 en pleine page, un h2 dans le panneau (le h1 est celui
  // de l'application) : les titres de section suivent, sans saut de niveau.
  const Title = compact ? "h2" : "h1";
  const SectionTitle = compact ? "h3" : "h2";

  return (
    <div>
      <header className="flex items-start gap-4">
        {prospect.optOut ? (
          <span
            title="Écarté : refus de démarchage"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-border text-app-muted"
          >
            <BlockedIcon size={22} />
            <span className="sr-only">Prospect écarté</span>
          </span>
        ) : (
          <ScoreBadge
            score={prospect.score}
            tier={prospect.tier}
            size={compact ? "md" : "lg"}
          />
        )}

        <div className="min-w-0 flex-1">
          <Title
            className={`font-semibold tracking-tight ${compact ? "text-[17px]" : "text-xl"}`}
          >
            {prospect.name}
          </Title>
          <p className="mt-0.5 text-[12.5px] text-app-muted">
            {prospect.sectorLabel}
            {prospect.address ? ` · ${prospect.address}` : ""}
            {prospect.tier ? ` · ${TIER_LABEL[prospect.tier]}` : ""}
          </p>
        </div>

        {!prospect.optOut && !compact && (
          <div className="flex shrink-0 gap-2">
            <EnrichButton
              enriching={enriching}
              enriched={!!enrichment}
              onClick={() => void enrich()}
            />
            <BriefLink id={prospect.id} />
          </div>
        )}
      </header>

      {!prospect.optOut && compact && (
        <div className="mt-3 flex gap-2">
          <EnrichButton
            enriching={enriching}
            enriched={!!enrichment}
            onClick={() => void enrich()}
          />
          <BriefLink id={prospect.id} />
        </div>
      )}

      {prospect.optOut && (
        <div className="mt-5 rounded-app border border-app-border bg-app-surface p-4">
          <p className="font-medium text-app-ko">Prospect écarté</p>
          <p className="mt-1 text-app-muted">
            {prospect.optOut}. L’entreprise a signalé elle-même qu’elle ne
            souhaite pas être démarchée pour un site web : elle n’est ni
            analysée, ni notée, et aucun brief n’est produit.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-app border border-app-border bg-app-surface px-3 py-2 text-[12.5px] text-app-ko">
          {error}
        </p>
      )}

      <Section title="Identité" as={SectionTitle}>
        <Facts
          rows={[
            ["Téléphone", prospect.phone],
            [
              "Site web",
              prospect.websiteUrl ? (
                <a
                  href={prospect.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-app-link hover:underline"
                >
                  {prospect.websiteUrl}
                </a>
              ) : (
                "Aucun site référencé"
              ),
            ],
            [
              "Réputation",
              prospect.rating !== null
                ? `${prospect.rating.toFixed(1)}/5 · ${prospect.reviewCount ?? 0} avis`
                : null,
            ],
            ["Type Google", prospect.primaryType],
            [
              "Vu dans",
              prospect.searches
                .map((s) => `${s.label} (${formatDistance(s.distanceM)})`)
                .join(", ") || null,
            ],
          ]}
        />
        {prospect.openingHours.length > 0 && (
          <details className="mt-3 text-[12.5px] text-app-muted">
            <summary className="cursor-pointer">Horaires d’ouverture</summary>
            <ul className="mt-1.5 space-y-0.5">
              {prospect.openingHours.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section title="Diagnostic" as={SectionTitle}>
        {prospect.breakdown.length === 0 ? (
          <p className="text-app-muted">
            {prospect.optOut
              ? "Non évalué."
              : "Aucun point à signaler : ce site n’a pas besoin d’être refait."}
          </p>
        ) : compact ? (
          <ul className="space-y-2">
            {prospect.breakdown.map((line) => (
              <li key={line.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span>{line.label}</span>
                  <span className="shrink-0 tnum text-app-muted">
                    {line.key.startsWith("bonus.") ? "+" : ""}
                    {line.points}
                  </span>
                </div>
                <p className="text-[12.5px] text-app-muted">{line.note}</p>
              </li>
            ))}
          </ul>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-app-border text-[12.5px] text-app-muted">
                <th className="py-1.5 font-medium">Critère</th>
                <th className="w-16 py-1.5 text-right font-medium">Points</th>
                <th className="py-1.5 pl-6 font-medium">Constat</th>
              </tr>
            </thead>
            <tbody>
              {prospect.breakdown.map((line) => (
                <tr key={line.key} className="border-b border-app-border last:border-0">
                  <td className="py-2 pr-4 align-top">{line.label}</td>
                  <td className="py-2 text-right align-top tnum">
                    {line.key.startsWith("bonus.") ? "+" : ""}
                    {line.points}
                  </td>
                  <td className="py-2 pl-6 align-top text-[12.5px] text-app-muted">
                    {line.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {analysis && (
        <Section title="Signaux du site" as={SectionTitle}>
          {analysis.reachable ? (
            <>
              <SignalChecklist analysis={analysis} />
              <p className="mt-3 text-[12.5px] text-app-muted">
                {analysis.cms
                  ? `${analysis.cms}${analysis.cmsVersion ? ` ${analysis.cmsVersion}` : ""} · `
                  : ""}
                {analysis.pageWeightKb} Ko · {analysis.fetchMs} ms
                {analysis.copyrightYear ? ` · copyright ${analysis.copyrightYear}` : ""}
                {analysis.pagesFetched.length > 0
                  ? ` · ${analysis.pagesFetched.length} page(s) analysée(s)`
                  : ""}
              </p>
            </>
          ) : (
            <p className="text-app-ko">
              Site injoignable : {analysis.failureReason ?? "aucune réponse"}
            </p>
          )}
        </Section>
      )}

      {!prospect.optOut && (
        <Section title="Entreprise" as={SectionTitle}>
          {enrichment ? (
            <>
              <Facts
                rows={[
                  [
                    "Dirigeant",
                    enrichment.dirigeantName
                      ? `${enrichment.dirigeantName}${enrichment.dirigeantRole ? ` — ${enrichment.dirigeantRole}` : ""}`
                      : null,
                  ],
                  [
                    "Source",
                    enrichment.dirigeantSource === "gouv"
                      ? "Annuaire des entreprises (data.gouv)"
                      : enrichment.dirigeantSource === "mentions_legales"
                        ? "Mentions légales du site"
                        : null,
                  ],
                  ["SIREN", enrichment.siren],
                  ["SIRET", enrichment.siret],
                  ["Forme juridique", enrichment.legalForm],
                  [
                    "Activité (NAF)",
                    enrichment.naf
                      ? `${enrichment.naf}${enrichment.nafLabel ? ` — ${enrichment.nafLabel}` : ""}`
                      : null,
                  ],
                  ["Création", enrichment.creationDate],
                ]}
              />

              {enrichment.services.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-1.5 text-[12.5px] font-medium text-app-muted">
                    Prestations affichées
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {enrichment.services.map((service) => (
                      <span
                        key={service}
                        className="rounded-app border border-app-border px-2 py-0.5 text-[12.5px]"
                      >
                        {service}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {enrichment.colors.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-1.5 text-[12.5px] font-medium text-app-muted">
                    Couleurs du site actuel
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {enrichment.colors.map((color) => (
                      <span key={color.hex} className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-5 w-5 rounded-[4px] border border-app-border"
                          style={{ background: color.hex }}
                        />
                        <code className="text-[12.5px] text-app-muted">
                          {color.hex}
                        </code>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-app-muted">
              Pas encore enrichi. « Enrichir » interroge l’annuaire des
              entreprises et les mentions légales du site — gratuit, quelques
              secondes.
            </p>
          )}
        </Section>
      )}
    </div>
  );
}

function EnrichButton({
  enriching,
  enriched,
  onClick,
}: {
  enriching: boolean;
  enriched: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={enriching}
      className="h-9 rounded-app border border-app-border bg-app-surface px-3 text-sm transition hover:bg-app-hover active:scale-[0.96] disabled:opacity-40"
    >
      {enriching ? "Enrichissement…" : enriched ? "Réactualiser" : "Enrichir"}
    </button>
  );
}

function BriefLink({ id }: { id: string }) {
  return (
    <a
      href={`/api/prospects/${encodeURIComponent(id)}/brief`}
      className="flex h-9 items-center rounded-app bg-app-accent px-3 text-sm font-medium text-white transition hover:bg-app-accent-hover active:scale-[0.96]"
    >
      Brief Markdown
    </a>
  );
}

function Section({
  title,
  as: Heading,
  children,
}: {
  title: string;
  as: "h2" | "h3";
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7 border-t border-app-border pt-5">
      <Heading className="mb-3 text-[15px] font-semibold tracking-tight">
        {title}
      </Heading>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  const visible = rows.filter(([, value]) => value !== null && value !== "");
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5">
      {visible.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[12.5px] text-app-muted">{label}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
