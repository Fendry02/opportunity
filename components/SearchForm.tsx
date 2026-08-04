"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_CITY,
  DEFAULT_RADIUS_M,
  RADIUS_OPTIONS,
} from "@/config/search-defaults";
import { SECTORS, sectorLabel } from "@/config/sectors";

/**
 * Formulaire inline du header : ville, rayon, secteurs.
 * Tout ce qui est pré-rempli vient de `config/` — rien n'est codé en dur ici.
 */

const DEFAULT_SECTORS = SECTORS.filter((s) => s.default).map((s) => s.id);

export function SearchForm({
  disabled,
  quotaExhausted = false,
  onSubmit,
}: {
  disabled: boolean;
  /** Plafond journalier atteint : inutile de laisser lancer un balayage. */
  quotaExhausted?: boolean;
  onSubmit: (input: {
    city: string;
    radiusM: number;
    sectors: string[];
  }) => Promise<void>;
}) {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M);
  const [sectors, setSectors] = useState<string[]>(DEFAULT_SECTORS);
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const sectorsRef = useRef<HTMLDivElement>(null);

  function toggleSector(id: string) {
    setSectors((current) =>
      current.includes(id)
        ? current.filter((s) => s !== id)
        : [...current, id],
    );
  }

  // Un menu qui ne se ferme qu'en recliquant sur son propre bouton est une
  // petite plaie : on ferme aussi au clic extérieur et à Échap.
  useEffect(() => {
    if (!sectorsOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!sectorsRef.current?.contains(event.target as Node)) {
        setSectorsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSectorsOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sectorsOpen]);

  // « 3 secteurs » ne dit rien ; « Plombier, Restaurant +2 » se relit.
  const sectorsSummary =
    sectors.length === 0
      ? "Aucun secteur"
      : sectors.length === SECTORS.length
        ? "Tous les secteurs"
        : sectors.length <= 2
          ? sectors.map(sectorLabel).join(", ")
          : `${sectors.slice(0, 2).map(sectorLabel).join(", ")} +${sectors.length - 2}`;

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({ city: city.trim(), radiusM, sectors });
      }}
    >
      <input
        type="text"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="Adresse ou commune"
        aria-label="Point de départ du balayage (adresse ou commune)"
        title="Le rayon est centré sur ce point. Une adresse précise donne un balayage plus fidèle qu'une commune."
        className="h-9 w-72 rounded-app border border-app-border bg-app-surface px-3 text-sm placeholder:text-app-muted"
      />

      <select
        value={radiusM}
        onChange={(e) => setRadiusM(Number(e.target.value))}
        aria-label="Rayon de recherche"
        className="h-9 rounded-app border border-app-border bg-app-surface px-2 text-sm"
      >
        {RADIUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div className="relative" ref={sectorsRef}>
        <button
          type="button"
          onClick={() => setSectorsOpen((open) => !open)}
          aria-expanded={sectorsOpen}
          aria-haspopup="true"
          title={sectors.map(sectorLabel).join(", ") || "Aucun secteur"}
          className="flex h-9 max-w-64 items-center gap-1.5 rounded-app border border-app-border bg-app-surface px-3 text-sm hover:bg-app-hover"
        >
          <span className="truncate">{sectorsSummary}</span>
          <span aria-hidden className="shrink-0 text-app-muted">
            ▾
          </span>
        </button>

        {sectorsOpen && (
          <div className="absolute left-0 top-11 z-[1000] max-h-96 w-72 overflow-y-auto rounded-app border border-app-border bg-app-surface p-2 shadow-sm">
            <div className="sticky top-0 flex items-center justify-between bg-app-surface px-1 pb-2 text-xs text-app-muted">
              <span>Secteurs balayés</span>
              <button
                type="button"
                className="text-app-accent hover:underline"
                onClick={() =>
                  setSectors(
                    sectors.length === SECTORS.length
                      ? []
                      : SECTORS.map((s) => s.id),
                  )
                }
              >
                {sectors.length === SECTORS.length ? "Tout décocher" : "Tout cocher"}
              </button>
            </div>
            {SECTORS.map((sector) => (
              <label
                key={sector.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-app-hover"
              >
                <input
                  type="checkbox"
                  checked={sectors.includes(sector.id)}
                  onChange={() => toggleSector(sector.id)}
                  className="accent-app-accent"
                />
                <span className="text-sm">{sector.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={
          disabled ||
          quotaExhausted ||
          city.trim().length < 2 ||
          sectors.length === 0
        }
        title={
          quotaExhausted
            ? "Plafond journalier d'appels Google atteint. Reprenez demain, ou relevez PLACES_DAILY_CAP dans .env.local."
            : undefined
        }
        className="h-9 rounded-app bg-app-accent px-4 text-sm font-medium text-white hover:bg-app-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {quotaExhausted
          ? "Plafond atteint"
          : disabled
            ? "Recherche en cours…"
            : "Lancer le balayage"}
      </button>
    </form>
  );
}
