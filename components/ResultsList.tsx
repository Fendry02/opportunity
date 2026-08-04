"use client";

import { useEffect, useRef } from "react";
import { ScoreBadge } from "./ScoreBadge";
import { SignalIcons } from "./SignalIcons";
import { BlockedIcon } from "./icons";
import { formatDistance } from "@/lib/format";
import type { ProspectSummary } from "@/lib/types";

/**
 * Liste compacte, synchronisée avec la carte : survol et sélection sont
 * partagés dans les deux sens.
 */

const SITE_STATE_LABEL: Record<ProspectSummary["siteState"], string> = {
  none: "Aucun site",
  dead: "Site injoignable",
  alive: "",
  pending: "Analyse en cours",
  opt_out: "",
};

export function ResultsList({
  results,
  selectedId,
  onSelect,
  onOpen,
  autoScroll = false,
}: {
  results: ProspectSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Même geste que le clic sur un pin : ouvre la fiche dans le panneau. */
  onOpen: (id: string) => void;
  /**
   * Ne vaut `true` que lorsque la sélection vient de la carte. Faire défiler
   * sur un survol de la liste ferait glisser la ligne sous le curseur.
   */
  autoScroll?: boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!autoScroll || !selectedId || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(
      `[data-prospect="${CSS.escape(selectedId)}"]`,
    );
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, autoScroll]);

  if (results.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-app-muted">
        Aucun prospect pour l’instant.
      </p>
    );
  }

  return (
    <ul ref={listRef} className="divide-y divide-app-border">
      {results.map((prospect) => {
        const selected = prospect.id === selectedId;
        return (
          <li
            key={prospect.id}
            data-prospect={prospect.id}
            onMouseEnter={() => onSelect(prospect.id)}
            onFocus={() => onSelect(prospect.id)}
            className={`px-4 py-2.5 transition-colors ${
              selected ? "" : "hover:bg-app-hover"
            }`}
            // Sélection = liseré indigo à gauche : on repère la ligne courante
            // sans que le fond se confonde avec le simple survol.
            style={
              selected
                ? {
                    background: "#eef2ff",
                    boxShadow: "inset 2px 0 0 var(--app-accent)",
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-3">
              {prospect.optOut ? (
                <span
                  title="Écarté : refus de démarchage"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-app-border text-app-muted"
                >
                  <BlockedIcon />
                  <span className="sr-only">Écarté</span>
                </span>
              ) : (
                <ScoreBadge score={prospect.score} tier={prospect.tier} />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(prospect.id)}
                    className={`truncate text-left font-medium hover:text-app-accent ${
                      prospect.optOut ? "text-app-muted line-through" : ""
                    }`}
                  >
                    {prospect.name}
                  </button>
                  <span className="shrink-0 text-[12.5px] text-app-muted">
                    {prospect.sectorLabel}
                  </span>
                </div>

                <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-app-muted">
                  <span className="tnum">
                    {formatDistance(prospect.distanceM)}
                  </span>
                  {prospect.rating !== null && (
                    <span className="tnum">
                      · {prospect.rating.toFixed(1)}/5 ({prospect.reviewCount})
                    </span>
                  )}
                  {SITE_STATE_LABEL[prospect.siteState] && (
                    <span>· {SITE_STATE_LABEL[prospect.siteState]}</span>
                  )}
                </div>

                {prospect.optOut && (
                  <p className="mt-0.5 text-[12.5px] text-app-ko">
                    Écarté — {prospect.optOut}
                  </p>
                )}
              </div>

              <SignalIcons flags={prospect.flags} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
