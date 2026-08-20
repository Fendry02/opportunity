"use client";

import { useEffect, useRef, useState } from "react";
import { ContactStatusControl } from "./ContactStatus";
import { ScoreBadge } from "./ScoreBadge";
import { SignalChecklist } from "./SignalChecklist";
import { BlockedIcon } from "./icons";
import { ApiError, fetchJson } from "@/lib/fetch-json";
import { formatDistance } from "@/lib/format";
import { TIER_LABEL } from "@/lib/scoring";
import type {
  ContactStatus,
  OutreachEmailDraft,
  OutreachMethod,
  ProspectDetail,
  WebsiteJob,
} from "@/lib/types";

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
  onProspectUpdate,
}: {
  initial: ProspectDetail;
  variant?: "page" | "panel";
  /** Remonte un changement de suivi/ignoré vers la liste et la carte. */
  onProspectUpdate?: (
    id: string,
    changes: { contactStatus: ContactStatus; ignored: boolean },
  ) => void;
}) {
  const [prospect, setProspect] = useState(initial);
  const [enriching, setEnriching] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingOutreach, setSavingOutreach] = useState(false);
  const [preparingEmail, setPreparingEmail] = useState(false);
  const [retryingDeployment, setRetryingDeployment] = useState(false);
  const [emailDraft, setEmailDraft] = useState<OutreachEmailDraft | null>(null);
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

  async function changeStatus(next: ContactStatus) {
    const previous = prospect.contactStatus;
    if (next === previous) return;

    setSavingStatus(true);
    setError(null);
    // Optimiste : le menu réagit tout de suite, on revient en arrière si l'appel échoue.
    setProspect((current) => ({ ...current, contactStatus: next }));
    try {
      const data = await fetchJson<{ prospect: ProspectDetail }>(
        `/api/prospects/${encodeURIComponent(prospect.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactStatus: next }),
        },
      );
      setProspect(data.prospect);
      onProspectUpdate?.(data.prospect.id, {
        contactStatus: data.prospect.contactStatus,
        ignored: data.prospect.ignored,
      });
    } catch (err) {
      setProspect((current) => ({ ...current, contactStatus: previous }));
      setError(
        err instanceof ApiError ? err.message : "Mise à jour du suivi impossible.",
      );
    } finally {
      setSavingStatus(false);
    }
  }

  async function toggleIgnored() {
    const previous = prospect.ignored;
    const next = !previous;
    setError(null);
    setProspect((current) => ({ ...current, ignored: next }));
    try {
      const data = await fetchJson<{ prospect: ProspectDetail }>(
        `/api/prospects/${encodeURIComponent(prospect.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ignored: next }),
        },
      );
      setProspect(data.prospect);
      onProspectUpdate?.(data.prospect.id, {
        contactStatus: data.prospect.contactStatus,
        ignored: data.prospect.ignored,
      });
    } catch (err) {
      setProspect((current) => ({ ...current, ignored: previous }));
      setError(
        err instanceof ApiError ? err.message : "Mise à jour impossible.",
      );
    }
  }

  async function saveOutreach(input: {
    method: OutreachMethod;
    recipientEmail: string | null;
  }) {
    setSavingOutreach(true);
    setError(null);
    setEmailDraft(null);
    try {
      let recipientEmail = input.recipientEmail;
      // Le choix « E-mail » lance la recherche sur le site public dès qu'aucun
      // destinataire n'est connu. La création du site fera le même enrichissement
      // si le prospect rejoint ensuite un lot, sans remplacer une saisie manuelle.
      if (input.method === "email" && !recipientEmail) {
        const enriched = await fetchJson<{ prospect: ProspectDetail }>(
          `/api/prospects/${encodeURIComponent(prospect.id)}/enrich`,
          { method: "POST" },
        );
        recipientEmail = enriched.prospect.outreach.recipientEmail;
      }
      const data = await fetchJson<{ prospect: ProspectDetail }>(
        `/api/prospects/${encodeURIComponent(prospect.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outreachMethod: input.method,
            outreachEmail: recipientEmail,
          }),
        },
      );
      setProspect(data.prospect);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mise à jour de l'approche impossible.");
    } finally {
      setSavingOutreach(false);
    }
  }

  async function prepareEmail() {
    setPreparingEmail(true);
    setError(null);
    try {
      const data = await fetchJson<{
        recipientEmail: string;
        draft: OutreachEmailDraft;
      }>(`/api/prospects/${encodeURIComponent(prospect.id)}/outreach`);
      setEmailDraft(data.draft);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Préparation du brouillon impossible.");
    } finally {
      setPreparingEmail(false);
    }
  }

  async function retryDeployment(jobId: number) {
    setRetryingDeployment(true);
    setError(null);
    try {
      const data = await fetchJson<{ job: WebsiteJob }>(
        `/api/websites/jobs/${jobId}/deploy/retry`,
        { method: "POST" },
      );
      setProspect((current) => ({ ...current, websiteProject: data.job }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Relance de Vercel impossible.");
    } finally {
      setRetryingDeployment(false);
    }
  }

  const hasActiveWebsiteWorkflow =
    prospect.websiteProject?.status === "pending" ||
    prospect.websiteProject?.status === "running" ||
    prospect.websiteProject?.deploymentStatus === "pending" ||
    prospect.websiteProject?.deploymentStatus === "running";

  useEffect(() => {
    if (!hasActiveWebsiteWorkflow) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const data = await fetchJson<{ prospect: ProspectDetail }>(
          `/api/prospects/${encodeURIComponent(prospect.id)}`,
        );
        if (!cancelled) setProspect(data.prospect);
      } catch {
        // Le panneau garde son état ; l'erreur sera affichée par l'action qui
        // l'a déclenchée, sans interrompre le suivi automatique.
      }
      if (!cancelled) timer = setTimeout(() => void refresh(), 1_500);
    };
    timer = setTimeout(() => void refresh(), 1_500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hasActiveWebsiteWorkflow, prospect.id]);

  const { analysis, enrichment } = prospect;
  const compact = variant === "panel";
  // La fiche est un h1 en pleine page, un h2 dans le panneau (le h1 est celui
  // de l'application) : les titres de section suivent, sans saut de niveau.
  const Title = compact ? "h2" : "h1";
  const SectionTitle = compact ? "h3" : "h2";

  return (
    <div className="stagger">
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
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <ContactStatusControl
              status={prospect.contactStatus}
              disabled={savingStatus}
              onChange={changeStatus}
            />
            <EnrichButton
              enriching={enriching}
              enriched={!!enrichment}
              onClick={() => void enrich()}
            />
            <BriefLink id={prospect.id} />
            <IgnoreButton
              ignored={prospect.ignored}
              onClick={() => void toggleIgnored()}
            />
          </div>
        )}
      </header>

      {!prospect.optOut && compact && (
        <div className="mt-3 flex flex-wrap gap-2">
          <ContactStatusControl
            status={prospect.contactStatus}
            disabled={savingStatus}
            onChange={changeStatus}
          />
          <EnrichButton
            enriching={enriching}
            enriched={!!enrichment}
            onClick={() => void enrich()}
          />
          <BriefLink id={prospect.id} />
          <IgnoreButton
            ignored={prospect.ignored}
            onClick={() => void toggleIgnored()}
          />
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

      {prospect.ignored && !prospect.optOut && (
        <p className="mt-4 rounded-app border border-app-border bg-app-surface px-3 py-2 text-[12.5px] text-app-muted">
          Prospect ignoré : grisé et repoussé en bas de la liste. « Ne plus
          ignorer » le réactive.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-app border border-app-border bg-app-surface px-3 py-2 text-[12.5px] text-app-ko">
          {error}
        </p>
      )}

      {!prospect.optOut && (
        <Section title="Approche commerciale" as={SectionTitle}>
          <CommercialApproach
            prospect={prospect}
            saving={savingOutreach}
            preparingEmail={preparingEmail}
            retryingDeployment={retryingDeployment}
            emailDraft={emailDraft}
            onSave={saveOutreach}
            onPrepareEmail={() => void prepareEmail()}
            onRetryDeployment={(jobId) => void retryDeployment(jobId)}
          />
        </Section>
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

function CommercialApproach({
  prospect,
  saving,
  preparingEmail,
  retryingDeployment,
  emailDraft,
  onSave,
  onPrepareEmail,
  onRetryDeployment,
}: {
  prospect: ProspectDetail;
  saving: boolean;
  preparingEmail: boolean;
  retryingDeployment: boolean;
  emailDraft: OutreachEmailDraft | null;
  onSave: (input: { method: OutreachMethod; recipientEmail: string | null }) => Promise<void>;
  onPrepareEmail: () => void;
  onRetryDeployment: (jobId: number) => void;
}) {
  const emailRef = useRef<HTMLInputElement>(null);
  const project = prospect.websiteProject;
  const preparedDraft = emailDraft ?? project?.emailDraft ?? null;

  const save = (method: OutreachMethod) => {
    const typedEmail = emailRef.current?.value ?? prospect.outreach.recipientEmail ?? "";
    return onSave({
      method,
      recipientEmail: method === "visit" ? null : typedEmail.trim() || null,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Canal de contact">
        <button
          type="button"
          onClick={() => void save("visit")}
          disabled={saving}
          aria-pressed={prospect.outreach.method === "visit"}
          className={`h-9 rounded-app border px-3 text-sm font-medium transition active:scale-[0.96] disabled:cursor-wait disabled:opacity-60 ${
            prospect.outreach.method === "visit"
              ? "border-app-accent bg-app-accent-soft text-app-link"
              : "border-app-border bg-app-surface hover:bg-app-hover"
          }`}
        >
          Visite sur place
        </button>
        <button
          type="button"
          onClick={() => void save("email")}
          disabled={saving}
          aria-pressed={prospect.outreach.method === "email"}
          className={`h-9 rounded-app border px-3 text-sm font-medium transition active:scale-[0.96] disabled:cursor-wait disabled:opacity-60 ${
            prospect.outreach.method === "email"
              ? "border-app-accent bg-app-accent-soft text-app-link"
              : "border-app-border bg-app-surface hover:bg-app-hover"
          }`}
        >
          E-mail
        </button>
      </div>

      {prospect.outreach.method === "visit" ? (
        <p className="text-[12.5px] leading-5 text-app-muted">
          Ce prospect est à traiter en visite. Le devis reste disponible ci-dessous
          pour préparer le rendez-vous.
        </p>
      ) : (
        <div className="space-y-2.5">
          <label className="block text-[12.5px] font-medium text-app-muted" htmlFor="outreach-email">
            E-mail du destinataire
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              key={`${prospect.id}:${prospect.outreach.recipientEmail ?? ""}`}
              ref={emailRef}
              id="outreach-email"
              type="email"
              defaultValue={prospect.outreach.recipientEmail ?? ""}
              onBlur={() => void save("email")}
              placeholder="bonjour@entreprise.fr"
              className="h-9 min-w-0 flex-1 rounded-app border border-app-border bg-app-surface px-3 text-sm placeholder:text-app-muted"
            />
            <button
              type="button"
              onClick={() => void save("email")}
              disabled={saving}
              className="h-9 rounded-app border border-app-border px-3 text-sm font-medium transition hover:bg-app-hover active:scale-[0.96] disabled:cursor-wait disabled:opacity-60"
            >
              Enregistrer
            </button>
          </div>
          {prospect.outreach.recipientEmailSource === "public_site" && (
            <p className="text-[12.5px] text-app-muted">
              Adresse trouvée sur le site public de l’entreprise.
            </p>
          )}
        </div>
      )}

      <DeploymentState
        project={project}
        retrying={retryingDeployment}
        onRetry={onRetryDeployment}
      />

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/prospects/${encodeURIComponent(prospect.id)}/quote`}
          className="flex h-9 items-center rounded-app border border-app-border bg-app-surface px-3 text-sm font-medium transition hover:bg-app-hover active:scale-[0.96]"
        >
          Télécharger le devis
        </a>
        {prospect.outreach.method === "email" && !preparedDraft && (
          <button
            type="button"
            onClick={onPrepareEmail}
            disabled={
              preparingEmail ||
              !prospect.outreach.recipientEmail ||
              project?.deploymentStatus !== "ready"
            }
            className="h-9 rounded-app bg-app-accent px-3 text-sm font-medium text-white transition hover:bg-app-accent-hover active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {preparingEmail ? "Préparation…" : "Afficher le brouillon"}
          </button>
        )}
      </div>

      {preparedDraft && (
        <div className="rounded-app border border-app-border bg-app-hover p-3">
          <p className="text-[12.5px] text-app-muted">
            Brouillon préparé automatiquement — aucun e-mail n’a été envoyé.
          </p>
          <p className="mt-2 text-sm font-medium">Objet : {preparedDraft.subject}</p>
          <textarea
            readOnly
            value={preparedDraft.body}
            className="mt-2 min-h-52 w-full resize-y rounded-app border border-app-border bg-app-surface p-2.5 text-[12.5px] leading-5 text-app-text"
            aria-label="Corps du brouillon d'e-mail"
          />
        </div>
      )}
    </div>
  );
}

function DeploymentState({
  project,
  retrying,
  onRetry,
}: {
  project: WebsiteJob | null;
  retrying: boolean;
  onRetry: (jobId: number) => void;
}) {
  if (!project) {
    return <p className="text-[12.5px] text-app-muted">Aucun site n’a encore été lancé pour ce prospect.</p>;
  }
  if (project.status !== "ready") {
    return (
      <p className="text-[12.5px] text-app-muted">
        {project.status === "failed"
          ? "La génération du site doit être relancée depuis le suivi des sites."
          : "Le site est en cours de génération ; la publication Vercel suivra automatiquement."}
      </p>
    );
  }
  if (project.deploymentStatus === "ready" && project.deploymentUrl) {
    return (
      <p className="text-[12.5px] text-app-ok">
        Site publié :{" "}
        <a href={project.deploymentUrl} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          {project.deploymentUrl}
        </a>
      </p>
    );
  }
  if (project.deploymentStatus === "failed") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-app-ko">
        <span>{project.deploymentError ?? "La publication Vercel a échoué."}</span>
        <button
          type="button"
          onClick={() => onRetry(project.id)}
          disabled={retrying}
          className="h-8 rounded-app border border-app-border bg-app-surface px-2.5 text-[12px] font-medium text-app-text transition hover:bg-app-hover active:scale-[0.96] disabled:cursor-wait disabled:opacity-60"
        >
          {retrying ? "Relance…" : "Relancer Vercel"}
        </button>
      </div>
    );
  }
  return (
    <p className="text-[12.5px] text-app-muted">
      {project.deploymentStatus === "running"
        ? "Publication Vercel en cours…"
        : "Publication Vercel en attente…"}
    </p>
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

function IgnoreButton({
  ignored,
  onClick,
}: {
  ignored: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 rounded-app border border-app-border bg-app-surface px-3 text-sm text-app-muted transition hover:bg-app-hover hover:text-app-text active:scale-[0.96]"
    >
      {ignored ? "Ne plus ignorer" : "Ignorer"}
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
