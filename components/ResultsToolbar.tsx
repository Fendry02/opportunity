"use client";

import {
  CONTACT_STATUS_LABEL,
  CONTACT_STATUS_ORDER,
} from "@/lib/contact-labels";
import { TIER_COLOR, TIER_LABEL, type ScoreTier } from "@/lib/scoring";
import type { ContactStatus, ProspectSummary } from "@/lib/types";

/**
 * Barre au-dessus de la liste : tri, filtres par palier, masquage des écartés.
 *
 * Les pastilles servent aussi de légende — c'est le seul endroit où l'on peut
 * relier une couleur de pin à sa signification, donc elles restent visibles
 * même quand aucun filtre n'est actif.
 */

export type SortMode = "score" | "distance";
/** « all » = pas de filtre de suivi. */
export type ContactFilter = ContactStatus | "all";

const TIERS: ScoreTier[] = ["high", "mid", "low", "none"];

const TIER_RANGE: Record<ScoreTier, string> = {
  high: "70 et plus",
  mid: "45 à 69",
  low: "25 à 44",
  none: "moins de 25",
};

export function ResultsToolbar({
  results,
  shown,
  searchId,
  sort,
  onSortChange,
  activeTiers,
  onToggleTier,
  hideOptOut,
  onHideOptOutChange,
  contactFilter,
  onContactFilterChange,
}: {
  /** Tous les résultats de la recherche, avant filtrage. */
  results: ProspectSummary[];
  /** Nombre affiché après filtrage. */
  shown: number;
  /** Recherche courante : cible de l'export groupé des briefs. */
  searchId: number;
  sort: SortMode;
  onSortChange: (sort: SortMode) => void;
  /** Paliers retenus ; vide = aucun filtre. */
  activeTiers: ScoreTier[];
  onToggleTier: (tier: ScoreTier) => void;
  hideOptOut: boolean;
  onHideOptOutChange: (hide: boolean) => void;
  contactFilter: ContactFilter;
  onContactFilterChange: (value: ContactFilter) => void;
}) {
  const counts = countByTier(results);
  const optOutCount = results.filter((r) => r.optOut).length;
  const briefableCount = results.filter(
    (r) => !r.optOut && r.score !== null,
  ).length;
  const filtered = shown !== results.length;

  return (
    <div className="sticky top-0 z-10 border-b border-app-border bg-app-surface px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[12.5px] text-app-muted tnum">
          {filtered ? `${shown} / ${results.length}` : results.length} prospect
          {results.length > 1 ? "s" : ""}
        </span>

        <Segmented
          value={sort}
          onChange={onSortChange}
          options={[
            { value: "score", label: "Score" },
            { value: "distance", label: "Distance" },
          ]}
        />

        <div className="flex items-center gap-1">
          {TIERS.map((tier) => (
            <TierPill
              key={tier}
              tier={tier}
              count={counts[tier]}
              active={activeTiers.includes(tier)}
              dimmed={activeTiers.length > 0 && !activeTiers.includes(tier)}
              onClick={() => onToggleTier(tier)}
            />
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <ContactFilterSelect
            value={contactFilter}
            onChange={onContactFilterChange}
          />

          {optOutCount > 0 && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-app-muted">
              <input
                type="checkbox"
                checked={hideOptOut}
                onChange={(e) => onHideOptOutChange(e.target.checked)}
                className="accent-app-accent"
              />
              Masquer les {optOutCount} écarté{optOutCount > 1 ? "s" : ""}
            </label>
          )}

          {briefableCount > 0 && (
            <a
              href={`/api/searches/${searchId}/briefs`}
              title={`Télécharger en un seul Markdown les ${briefableCount} briefs de ce balayage`}
              className="flex h-8 items-center rounded-app border border-app-border px-2.5 text-[12.5px] font-medium transition hover:bg-app-hover active:scale-[0.96]"
            >
              Exporter les briefs
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactFilterSelect({
  value,
  onChange,
}: {
  value: ContactFilter;
  onChange: (value: ContactFilter) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12.5px] text-app-muted">
      Suivi
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ContactFilter)}
        aria-label="Filtrer par suivi de contact"
        className="h-8 rounded-app border border-app-border bg-app-surface px-1.5 text-[12.5px]"
      >
        <option value="all">Tous</option>
        {CONTACT_STATUS_ORDER.map((status) => (
          <option key={status} value={status}>
            {CONTACT_STATUS_LABEL[status]}
          </option>
        ))}
      </select>
    </label>
  );
}

function TierPill({
  tier,
  count,
  active,
  dimmed,
  onClick,
}: {
  tier: ScoreTier;
  count: number;
  active: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={count === 0}
      title={`${TIER_LABEL[tier]} — score ${TIER_RANGE[tier]}`}
      className={`flex items-center gap-1.5 rounded-app border px-1.5 py-0.5 text-[12.5px] tnum transition-opacity disabled:cursor-default disabled:opacity-35 ${
        active
          ? "border-app-accent bg-app-hover"
          : "border-app-border hover:bg-app-hover"
      } ${dimmed ? "opacity-45" : ""}`}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: TIER_COLOR[tier] }}
      />
      {count}
    </button>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex rounded-app border border-app-border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-[5px] px-2 py-0.5 text-[12.5px] ${
            value === option.value
              ? "bg-app-accent text-white"
              : "text-app-muted hover:bg-app-hover"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function countByTier(results: ProspectSummary[]): Record<ScoreTier, number> {
  const counts: Record<ScoreTier, number> = { high: 0, mid: 0, low: 0, none: 0 };
  for (const result of results) {
    if (result.tier) counts[result.tier] += 1;
  }
  return counts;
}

/** Applique tri et filtres. Purement local : aucun appel réseau. */
export function applyFilters(
  results: ProspectSummary[],
  options: {
    sort: SortMode;
    activeTiers: ScoreTier[];
    hideOptOut: boolean;
    /** Filtre de suivi ; absent ou « all » = tous. */
    contactFilter?: ContactFilter;
  },
): ProspectSummary[] {
  const filtered = results.filter((result) => {
    if (options.hideOptOut && result.optOut) return false;
    // Le filtre de suivi s'applique à tous, écartés compris.
    if (
      options.contactFilter &&
      options.contactFilter !== "all" &&
      result.contactStatus !== options.contactFilter
    ) {
      return false;
    }
    // Un prospect écarté n'a pas de palier : il échappe au filtre par couleur
    // tant qu'on ne demande pas explicitement de le masquer.
    if (options.activeTiers.length === 0 || result.optOut) return true;
    return result.tier !== null && options.activeTiers.includes(result.tier);
  });

  return [...filtered].sort((a, b) => {
    // Les écartés et les non notés restent en fin de liste, quel que soit le tri.
    const rank = (r: ProspectSummary) => (r.optOut ? 2 : r.score === null ? 1 : 0);
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;

    if (options.sort === "distance") return a.distanceM - b.distanceM;
    return (b.score ?? -1) - (a.score ?? -1) || a.distanceM - b.distanceM;
  });
}
