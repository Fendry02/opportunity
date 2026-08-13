"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProspectDetailView } from "./ProspectDetailView";
import { ApiError, fetchJson } from "@/lib/fetch-json";
import type { ProspectDetail } from "@/lib/types";

/**
 * Fiche ouverte au clic sur un pin de la carte.
 *
 * Le panneau se glisse par-dessus la liste, jamais par-dessus la carte : on
 * garde les pins sous les yeux et on referme d'un Échap ou d'un clic sur la
 * croix. C'est ce qui permet d'enchaîner les prospects sans perdre le fil.
 */

export function ProspectPanel({
  prospectId,
  onClose,
}: {
  prospectId: string;
  onClose: () => void;
}) {
  const [prospect, setProspect] = useState<ProspectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Le composant est monté avec une `key` par prospect : l'état repart de zéro
  // à chaque ouverture, inutile de le réinitialiser ici.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const data = await fetchJson<{ prospect: ProspectDetail }>(
          `/api/prospects/${encodeURIComponent(prospectId)}`,
        );
        if (!cancelled) setProspect(data.prospect);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Fiche prospect introuvable.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [prospectId, reloadNonce]);

  // Échap ferme : c'est le geste attendu pour revenir à la carte.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
  }, [prospectId]);

  return (
    <aside
      role="region"
      aria-label="Fiche prospect"
      className="flex h-full flex-col border-l border-app-border bg-app-surface"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-app-border px-4 py-2">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="flex h-8 items-center rounded-app border border-app-border px-2.5 text-[12.5px] transition hover:bg-app-hover active:scale-[0.96]"
        >
          ← Retour à la liste
        </button>
        <span className="text-[12.5px] text-app-muted">Échap</span>

        {prospect && (
          <Link
            href={`/prospects/${encodeURIComponent(prospect.id)}`}
            className="ml-auto text-[12.5px] text-app-link hover:underline"
          >
            Ouvrir en pleine page
          </Link>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error ? (
          <div className="text-app-ko">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setReloadNonce((n) => n + 1);
              }}
              className="mt-3 rounded-app border border-app-border px-2.5 py-1 text-[12.5px] font-medium hover:bg-app-hover"
            >
              Réessayer
            </button>
          </div>
        ) : prospect ? (
          <ProspectDetailView initial={prospect} variant="panel" />
        ) : (
          <p className="text-app-muted">Chargement…</p>
        )}
      </div>
    </aside>
  );
}
