"use client";

import { useEffect, useRef } from "react";
import { ContactStatusChip } from "./ContactStatus";
import { ScoreBadge } from "./ScoreBadge";
import { SignalIcons } from "./SignalIcons";
import { BlockedIcon } from "./icons";
import { formatDistance } from "@/lib/format";
import type { ProspectSummary } from "@/lib/types";

/**
 * Liste compacte, synchronisée avec la carte : la liste réagit au survol,
 * tandis que la carte sélectionne uniquement au clic sur un pin.
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
  websiteSelection = new Set<string>(),
  onToggleWebsiteSelection,
}: {
  results: ProspectSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Clic sur la ligne : ouvre la fiche dans le panneau. */
  onOpen: (id: string) => void;
  /**
   * Ne vaut `true` que lorsque la sélection vient de la carte. Faire défiler
   * sur un survol de la liste ferait glisser la ligne sous le curseur.
   */
  autoScroll?: boolean;
  /** Prospects préparés pour la création de leur vitrine. */
  websiteSelection?: ReadonlySet<string>;
  onToggleWebsiteSelection?: (id: string) => void;
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
            className="flex items-stretch transition-colors"
            // Sélection = liseré indigo à gauche : on repère la ligne courante
            // sans que le fond se confonde avec le simple survol.
            style={
              selected
                ? {
                    background: "var(--app-accent-soft)",
                    boxShadow: "inset 2px 0 0 var(--app-accent)",
                  }
                : undefined
            }
          >
            {onToggleWebsiteSelection && !prospect.optOut && (
              <label className="flex w-11 shrink-0 cursor-pointer items-center justify-center border-r border-transparent px-2 hover:bg-app-hover">
                <input
                  type="checkbox"
                  checked={websiteSelection.has(prospect.id)}
                  onChange={() => onToggleWebsiteSelection(prospect.id)}
                  aria-label={`Sélectionner ${prospect.name} pour créer un site`}
                  className="h-4 w-4 cursor-pointer rounded border-app-border accent-app-accent"
                />
              </label>
            )}
            {/* Toute la ligne est cliquable : un vrai bouton, focusable au clavier. */}
            <button
              type="button"
              onClick={() => onOpen(prospect.id)}
              onMouseEnter={() => onSelect(prospect.id)}
              onFocus={() => onSelect(prospect.id)}
              aria-label={`Ouvrir la fiche de ${prospect.name}`}
              className={`group flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                selected ? "" : "hover:bg-app-hover"
              } ${prospect.ignored ? "opacity-55" : ""}`}
            >
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
                  <span
                    className={`truncate font-medium transition-colors group-hover:text-app-link ${
                      prospect.optOut ? "text-app-muted line-through" : ""
                    }`}
                  >
                    {prospect.name}
                  </span>
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
                  <ContactStatusChip status={prospect.contactStatus} />
                  {prospect.ignored && (
                    <span className="rounded-full border border-app-border px-1.5 py-0.5 text-[11px] text-app-muted">
                      Ignoré
                    </span>
                  )}
                </div>

                {prospect.optOut && (
                  <p className="mt-0.5 text-[12.5px] text-app-ko">
                    Écarté — {prospect.optOut}
                  </p>
                )}
              </div>

              <SignalIcons flags={prospect.flags} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
