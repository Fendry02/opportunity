"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProspectDetailView } from "./ProspectDetailView";
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
  const closeRef = useRef<HTMLButtonElement>(null);

  // Le composant est monté avec une `key` par prospect : l'état repart de zéro
  // à chaque ouverture, inutile de le réinitialiser ici.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const res = await fetch(`/api/prospects/${encodeURIComponent(prospectId)}`, {
        cache: "no-store",
      });
      if (cancelled) return;
      if (!res.ok) {
        setError("Fiche introuvable");
        return;
      }
      const data = (await res.json()) as { prospect: ProspectDetail };
      if (!cancelled) setProspect(data.prospect);
    })();

    return () => {
      cancelled = true;
    };
  }, [prospectId]);

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
          className="flex h-8 items-center rounded-app border border-app-border px-2.5 text-[12.5px] hover:bg-app-hover"
        >
          ← Retour à la liste
        </button>
        <span className="text-[12.5px] text-app-muted">Échap</span>

        {prospect && (
          <Link
            href={`/prospects/${encodeURIComponent(prospect.id)}`}
            className="ml-auto text-[12.5px] text-app-accent hover:underline"
          >
            Ouvrir en pleine page
          </Link>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error ? (
          <p className="text-app-ko">{error}</p>
        ) : prospect ? (
          <ProspectDetailView initial={prospect} variant="panel" />
        ) : (
          <p className="text-app-muted">Chargement…</p>
        )}
      </div>
    </aside>
  );
}
