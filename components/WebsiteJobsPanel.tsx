"use client";

import { useEffect, useState } from "react";
import { describeError, fetchJson } from "@/lib/fetch-json";
import type { WebsiteJob, WebsiteJobStatus } from "@/lib/types";

const POLL_INTERVAL_MS = 1500;

const STATUS: Record<
  WebsiteJobStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "En attente",
    className: "border-app-border bg-app-hover text-app-muted",
  },
  running: {
    label: "En cours",
    className: "border-app-accent/20 bg-app-accent-soft text-app-link",
  },
  ready: {
    label: "Prêt",
    className: "border-app-ok/20 bg-app-ok/10 text-app-ok",
  },
  failed: {
    label: "À relancer",
    className: "border-app-ko/20 bg-app-ko/10 text-app-ko",
  },
};

/**
 * Le panneau lit l'état durable plutôt que de dépendre du cycle de vie de la
 * requête qui a créé les projets. Il peut donc être fermé puis rouvert sans
 * perdre la progression d'un agent déjà lancé.
 */
export function WebsiteJobsPanel({ onClose }: { onClose: () => void }) {
  const [jobs, setJobs] = useState<WebsiteJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [retryingDeploymentId, setRetryingDeploymentId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await fetchJson<{ jobs: WebsiteJob[] }>("/api/websites/jobs");
        if (cancelled) return;
        setJobs(data.jobs);
        setError(null);
        setLoading(false);
        if (
          data.jobs.some(
            (job) =>
              job.status === "pending" ||
              job.status === "running" ||
              job.deploymentStatus === "pending" ||
              job.deploymentStatus === "running",
          )
        ) {
          timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setError(describeError(err));
        setLoading(false);
        timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refreshToken]);

  const retry = async (jobId: number) => {
    setRetryingId(jobId);
    try {
      await fetchJson(`/api/websites/jobs/${jobId}/retry`, { method: "POST" });
      setRefreshToken((token) => token + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRetryingId(null);
    }
  };

  const retryDeployment = async (jobId: number) => {
    setRetryingDeploymentId(jobId);
    try {
      await fetchJson(`/api/websites/jobs/${jobId}/deploy/retry`, { method: "POST" });
      setRefreshToken((token) => token + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRetryingDeploymentId(null);
    }
  };

  const activeCount = jobs.filter(
    (job) =>
      job.status === "pending" ||
      job.status === "running" ||
      job.deploymentStatus === "pending" ||
      job.deploymentStatus === "running",
  ).length;

  return (
    <section className="flex h-full flex-col panel-enter" aria-label="Sites créés">
      <header className="flex shrink-0 items-start gap-3 border-b border-app-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight text-app-text">
              Sites créés
            </h2>
            {activeCount > 0 && (
              <span className="tnum text-[12px] text-app-muted" role="status">
                {activeCount} en cours
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-app-muted text-pretty">
            Chaque projet est finalisé localement, puis publié sur Vercel dès que
            le jeton de publication est configuré.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex h-10 shrink-0 items-center rounded-app px-2.5 text-[12.5px] font-medium text-app-muted transition-colors hover:bg-app-hover hover:text-app-text active:scale-[0.96]"
        >
          Retour
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="px-1 py-4 text-[12.5px] text-app-muted">Chargement des projets…</p>
        ) : jobs.length === 0 ? (
          <EmptyJobs />
        ) : (
          <div className="stagger space-y-3">
            {jobs.map((job) => (
              <WebsiteJobCard
                key={job.id}
                job={job}
                retrying={retryingId === job.id}
                retryingDeployment={retryingDeploymentId === job.id}
                onRetry={() => void retry(job.id)}
                onRetryDeployment={() => void retryDeployment(job.id)}
              />
            ))}
          </div>
        )}
        {error && (
          <div className="mt-3 flex items-center gap-3 rounded-app border border-app-ko/25 bg-app-ko/10 px-3 py-2 text-[12.5px] text-app-ko">
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setRefreshToken((token) => token + 1)}
              className="h-8 shrink-0 rounded-app px-2 font-medium transition-colors hover:bg-app-hover active:scale-[0.96]"
            >
              Réessayer
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function WebsiteJobCard({
  job,
  retrying,
  retryingDeployment,
  onRetry,
  onRetryDeployment,
}: {
  job: WebsiteJob;
  retrying: boolean;
  retryingDeployment: boolean;
  onRetry: () => void;
  onRetryDeployment: () => void;
}) {
  const status = STATUS[job.status];
  const deployment = STATUS[job.deploymentStatus];
  const details = job.error ?? job.output;

  return (
    <article className="rounded-[12px] border border-app-border bg-app-surface px-3.5 py-3 shadow-[0_1px_2px_rgb(0_0_0_/_0.03)]">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-semibold text-app-text" title={job.businessName}>
            {job.businessName}
          </h3>
          <p className="mt-0.5 truncate text-[12px] text-app-muted" title={job.directory}>
            {job.directory.split("/").at(-1)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      {details && (
        <p
          className={`mt-2 text-[12px] leading-5 ${job.error ? "text-app-ko" : "text-app-muted"}`}
          title={details}
        >
          {shorten(details)}
        </p>
      )}

      {job.status === "ready" && (
        <div className="mt-2.5 rounded-app border border-app-border bg-app-hover px-2.5 py-2 text-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-app-muted">Publication Vercel</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${deployment.className}`}>
              {deployment.label}
            </span>
          </div>
          {job.deploymentUrl ? (
            <a
              href={job.deploymentUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 block truncate font-medium text-app-link hover:underline"
              title={job.deploymentUrl}
            >
              {job.deploymentUrl}
            </a>
          ) : job.deploymentError ? (
            <p className="mt-1.5 leading-5 text-app-ko" title={job.deploymentError}>
              {shorten(job.deploymentError)}
            </p>
          ) : (
            <p className="mt-1.5 leading-5 text-app-muted">
              {job.deploymentStatus === "running"
                ? "Publication en cours…"
                : "Publication prête à démarrer…"}
            </p>
          )}
          {job.emailDraft && (
            <p className="mt-1.5 font-medium text-app-ok">
              Brouillon d’e-mail prêt
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-app-border pt-2.5">
        <a
          href={`/api/websites/jobs/${job.id}/preview`}
          target="_blank"
          rel="noreferrer"
          className="flex h-9 items-center rounded-app px-2 text-[12px] font-medium text-app-link transition-colors hover:bg-app-hover active:scale-[0.96]"
        >
          Aperçu
        </a>
        <a
          href={`/api/websites/jobs/${job.id}/prompt`}
          target="_blank"
          rel="noreferrer"
          className="flex h-9 items-center rounded-app px-2 text-[12px] font-medium text-app-muted transition-colors hover:bg-app-hover hover:text-app-text active:scale-[0.96]"
        >
          Prompt
        </a>
        <span className="ml-auto text-[11px] text-app-muted tnum">
          tentative {job.attempts || 0}
        </span>
        {job.status === "failed" && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="flex h-9 items-center rounded-app bg-app-accent px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-app-accent-hover active:scale-[0.96] disabled:cursor-wait disabled:opacity-60"
          >
            {retrying ? "Relance…" : "Relancer"}
          </button>
        )}
        {job.status === "ready" && job.deploymentStatus === "failed" && (
          <button
            type="button"
            onClick={onRetryDeployment}
            disabled={retryingDeployment}
            className="flex h-9 items-center rounded-app bg-app-accent px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-app-accent-hover active:scale-[0.96] disabled:cursor-wait disabled:opacity-60"
          >
            {retryingDeployment ? "Relance…" : "Relancer Vercel"}
          </button>
        )}
      </div>
    </article>
  );
}

function EmptyJobs() {
  return (
    <div className="px-2 py-10 text-[13px] text-app-muted">
      <p className="font-medium text-app-text">Aucun site lancé pour l’instant.</p>
      <p className="mt-2 text-pretty">
        Sélectionnez des prospects dans la liste puis créez leurs sites. Leur
        avancement apparaîtra ici.
      </p>
    </div>
  );
}

function shorten(value: string): string {
  return value.length > 240 ? `${value.slice(0, 240)}…` : value;
}
