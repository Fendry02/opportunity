"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProspectPanel } from "./ProspectPanel";
import { QuotaBadge } from "./QuotaBadge";
import { ResultsList } from "./ResultsList";
import { ResultsSkeleton } from "./ResultsSkeleton";
import {
  ResultsToolbar,
  type ContactFilter,
  type SortMode,
  applyFilters,
  isWebsiteGenerationEligible,
} from "./ResultsToolbar";
import { SearchForm } from "./SearchForm";
import { SetupNotice } from "./SetupNotice";
import { ThemeToggle } from "./ThemeToggle";
import { WebsiteJobsPanel } from "./WebsiteJobsPanel";
import { RadarIcon } from "./icons";
import { ApiError, describeError, fetchJson } from "@/lib/fetch-json";
import { formatRadius } from "@/lib/format";
import type { ScoreTier } from "@/lib/scoring";
import type { ProspectSummary, Quota, SearchSummary } from "@/lib/types";

/** Dernière recherche consultée : permet de la retrouver au retour d'une fiche. */
const LAST_SEARCH_KEY = "opportunity:last-search";

/**
 * Écran principal : header fin, puis carte 55 % / liste 45 % pleine hauteur.
 *
 * La recherche est longue : on interroge `GET /api/searches/:id` toutes les
 * 1,5 s et on réaffiche les résultats partiels au fil de l'eau. Le polling est
 * modélisé comme un abonnement à un système externe : un effet piloté par
 * l'identifiant de la recherche active, annulé au démontage.
 */

const POLL_INTERVAL_MS = 1500;

/**
 * Le polling tolère quelques échecs réseau d'affilée (blip Wi-Fi, serveur qui
 * redémarre) avant de rendre la main à l'utilisateur avec un « Réessayer ».
 */
const MAX_POLL_RETRIES = 4;
const MAX_WEBSITE_SELECTION = 12;

/** Erreur affichée dans le bandeau de statut, avec un éventuel « Réessayer ». */
type AppError = { message: string; retry?: () => void };

// Leaflet accède à `window` dès l'import : jamais de rendu serveur.
const ResultsMap = dynamic(() => import("./ResultsMap").then((m) => m.ResultsMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-app-muted">
      Chargement de la carte…
    </div>
  ),
});

export function SearchWorkspace() {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [search, setSearch] = useState<SearchSummary | null>(null);
  const [results, setResults] = useState<ProspectSummary[]>([]);
  /** `from` sert à ne faire défiler la liste que pour une sélection venue de la carte. */
  const [selection, setSelection] = useState<{
    id: string | null;
    from: "map" | "list";
  }>({ id: null, from: "list" });
  const selectedId = selection.id;
  /** Prospect dont la fiche est ouverte dans le panneau, à droite. */
  const [openedId, setOpenedId] = useState<string | null>(null);
  /** Prospects choisis pour enrichissement + création de vitrines en lot. */
  const [websiteSelection, setWebsiteSelection] = useState<Set<string>>(
    () => new Set(),
  );
  const [generatingWebsites, setGeneratingWebsites] = useState(false);
  const [websiteGenerationMessage, setWebsiteGenerationMessage] = useState<string | null>(
    null,
  );
  /** Panneau durable de suivi des agents, indépendant de la recherche ouverte. */
  const [websiteJobsOpen, setWebsiteJobsOpen] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [history, setHistory] = useState<SearchSummary[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  /** Incrémenté à chaque fin de recherche pour rafraîchir historique et quota. */
  const [historyVersion, setHistoryVersion] = useState(0);
  /** Bump manuel pour relancer le polling après une coupure réseau. */
  const [pollNonce, setPollNonce] = useState(0);

  // Tri et filtres : purement locaux, ils ne relancent jamais de recherche.
  const [sort, setSort] = useState<SortMode>("score");
  const [activeTiers, setActiveTiers] = useState<ScoreTier[]>([]);
  const [hideOptOut, setHideOptOut] = useState(false);
  const [hideIgnored, setHideIgnored] = useState(false);
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");

  const visible = useMemo(
    () =>
      applyFilters(results, {
        sort,
        activeTiers,
        hideOptOut,
        hideIgnored,
        contactFilter,
      }),
    [results, sort, activeTiers, hideOptOut, hideIgnored, contactFilter],
  );

  const selectFromMap = useCallback(
    (id: string | null) => setSelection({ id, from: "map" }),
    [],
  );
  const selectFromList = useCallback(
    (id: string | null) => setSelection({ id, from: "list" }),
    [],
  );

  const toggleTier = useCallback((tier: ScoreTier) => {
    setActiveTiers((current) =>
      current.includes(tier)
        ? current.filter((t) => t !== tier)
        : [...current, tier],
    );
  }, []);

  // Un changement de suivi/ignoré fait dans la fiche doit se voir tout de suite
  // dans la liste et sur la carte, sans attendre un rafraîchissement.
  const patchResult = useCallback(
    (id: string, changes: Pick<ProspectSummary, "contactStatus" | "ignored">) =>
      setResults((current) =>
        current.map((r) => (r.id === id ? { ...r, ...changes } : r)),
      ),
    [],
  );

  const toggleWebsiteSelection = useCallback((id: string) => {
    setWebsiteSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= MAX_WEBSITE_SELECTION) {
        setWebsiteGenerationMessage(
          `La création en lot est limitée à ${MAX_WEBSITE_SELECTION} prospects.`,
        );
        return current;
      }
      next.add(id);
      return next;
    });
  }, []);

  const addVisibleToWebsiteSelection = useCallback(() => {
    setWebsiteSelection((current) => {
      const next = new Set(current);
      const eligibleIds = visible
        .filter(isWebsiteGenerationEligible)
        .map((prospect) => prospect.id)
        .filter((id) => !next.has(id));
      const room = MAX_WEBSITE_SELECTION - next.size;
      for (const id of eligibleIds.slice(0, Math.max(0, room))) next.add(id);
      if (eligibleIds.length > room) {
        setWebsiteGenerationMessage(
          `Les ${MAX_WEBSITE_SELECTION} premiers prospects disponibles ont été retenus.`,
        );
      }
      return next;
    });
  }, [visible]);

  const clearWebsiteSelection = useCallback(() => {
    setWebsiteSelection(new Set());
    setWebsiteGenerationMessage(null);
  }, []);

  const generateWebsites = useCallback(async () => {
    const prospectIds = [...websiteSelection];
    if (prospectIds.length === 0) return;

    setGeneratingWebsites(true);
    setWebsiteGenerationMessage(
      `Enrichissement de ${prospectIds.length} prospect${prospectIds.length > 1 ? "s" : ""}, puis création des vitrines…`,
    );
    try {
      const data = await fetchJson<{
        summary: {
          selected: number;
          created: number;
          queued: number;
          skipped: number;
          failed: number;
        };
      }>("/api/websites/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds }),
      });
      const parts = [
        `${data.summary.created} site${data.summary.created > 1 ? "s" : ""} créé${data.summary.created > 1 ? "s" : ""}`,
      ];
      if (data.summary.queued) {
        parts.push(
          `${data.summary.queued} mis en file pour finalisation`,
        );
      }
      if (data.summary.skipped) parts.push(`${data.summary.skipped} ignoré${data.summary.skipped > 1 ? "s" : ""}`);
      if (data.summary.failed) parts.push(`${data.summary.failed} en erreur`);
      setWebsiteGenerationMessage(
        `${parts.join(" · ")} dans Programmes/websites.`,
      );
      setWebsiteSelection(new Set());
      if (data.summary.queued > 0) setWebsiteJobsOpen(true);
    } catch (err) {
      setWebsiteGenerationMessage(describeError(err));
    } finally {
      setGeneratingWebsites(false);
    }
  }, [websiteSelection]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Historique et quota sont indépendants : un quota en erreur ne doit pas
      // priver l'utilisateur de son historique, et inversement.
      const [searches, quotaRes] = await Promise.allSettled([
        fetchJson<{ searches: SearchSummary[] }>("/api/searches"),
        fetchJson<Quota>("/api/quota"),
      ]);
      if (cancelled) return;

      if (searches.status === "fulfilled") {
        setHistory(searches.value.searches);
        setError(null);
        // Au démarrage, on ouvre la recherche la plus récente. Une ancienne
        // valeur en sessionStorage peut pointer sur la démo et ramener à 0,0.
        setActiveId(
          (current) => current ?? searches.value.searches[0]?.id ?? null,
        );
      } else {
        setError({
          message: describeError(searches.reason),
          retry: () => setHistoryVersion((v) => v + 1),
        });
      }

      // Le badge quota est secondaire : s'il échoue, il disparaît, sans plus.
      if (quotaRes.status === "fulfilled") setQuota(quotaRes.value);
    })();
    return () => {
      cancelled = true;
    };
  }, [historyVersion]);

  useEffect(() => {
    if (activeId !== null) {
      window.sessionStorage.setItem(LAST_SEARCH_KEY, String(activeId));
    }
  }, [activeId]);

  // « / » cible le champ de recherche, comme dans les outils qu'on utilise vite.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing) return;
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label^="Point de départ"]',
      );
      if (input) {
        event.preventDefault();
        input.focus();
        input.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (activeId === null) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Échecs réseau consécutifs : on retente en silence jusqu'au plafond.
    let failures = 0;

    const tick = async () => {
      try {
        const data = await fetchJson<{
          search: SearchSummary;
          results: ProspectSummary[];
        }>(`/api/searches/${activeId}`);
        if (cancelled) return;

        failures = 0;
        setSearch(data.search);
        setResults(data.results);
        setWebsiteSelection((current) => {
          const activeIds = new Set(
            data.results
              .filter(isWebsiteGenerationEligible)
              .map((prospect) => prospect.id),
          );
          const next = new Set([...current].filter((id) => activeIds.has(id)));
          const unchanged =
            next.size === current.size && [...next].every((id) => current.has(id));
          return unchanged ? current : next;
        });

        if (data.search.status === "running") {
          setError(null);
          timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
        } else {
          setHistoryVersion((v) => v + 1);
          setError(
            data.search.status === "error"
              ? { message: data.search.error ?? "La recherche a échoué." }
              : null,
          );
        }
      } catch (err) {
        if (cancelled) return;

        // Recherche supprimée entre-temps : inutile d'insister.
        if (err instanceof ApiError && err.status === 404) {
          setError({ message: "Cette recherche est introuvable." });
          return;
        }

        failures += 1;
        if (failures <= MAX_POLL_RETRIES) {
          timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
        } else {
          setError({
            message: `${describeError(err)} La mise à jour est suspendue.`,
            retry: () => setPollNonce((n) => n + 1),
          });
        }
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeId, pollNonce]);

  const startSearch = useCallback(
    async (input: { city: string; radiusM: number; sectors: string[] }) => {
      setError(null);
      setResults([]);
      setWebsiteSelection(new Set());
      setWebsiteGenerationMessage(null);
      setWebsiteJobsOpen(false);
      setSelection({ id: null, from: "list" });
      setOpenedId(null);
      setSearch(null);
      setActiveId(null);

      try {
        const data = await fetchJson<{ id: number }>("/api/searches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        setActiveId(data.id);
      } catch (err) {
        // Le formulaire reste sous la main : relancer suffit, pas de bouton dédié.
        setError({ message: describeError(err) });
      }
    },
    [],
  );

  const openSearch = useCallback((searchId: number) => {
    setError(null);
    setSelection({ id: null, from: "list" });
    // Sans ça, la fiche du prospect précédent reste affichée par-dessus la
    // nouvelle liste — on croit que la recherche n'a rien renvoyé.
    setOpenedId(null);
    setResults([]);
    setWebsiteSelection(new Set());
    setWebsiteGenerationMessage(null);
    setWebsiteJobsOpen(false);
    setActiveId(searchId);
  }, []);

  const running = search?.status === "running" || (activeId !== null && !search);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-4 border-b border-app-border bg-app-surface px-5 py-2.5">
        <h1 className="text-[15px] font-semibold tracking-tight">Opportunity</h1>
        <SearchForm
          disabled={running}
          quotaExhausted={quota ? !quota.mock && quota.remaining === 0 : false}
          onSubmit={startSearch}
        />

        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          <QuotaBadge quota={quota} />
          {history.length > 0 && (
            <select
              aria-label="Recherches précédentes"
              // Toujours remis à vide : sinon re-choisir la recherche déjà
              // affichée n'émet aucun événement et le menu paraît cassé.
              value=""
              onChange={(e) => e.target.value && openSearch(Number(e.target.value))}
              className="h-9 max-w-56 rounded-app border border-app-border bg-app-surface px-2 text-[12.5px] text-app-muted"
            >
              <option value="">Recherches précédentes…</option>
              {history.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id === activeId ? "▸ " : ""}
                  {item.label} · {item.resultCount} prospects
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => {
              setOpenedId(null);
              setWebsiteJobsOpen(true);
            }}
            aria-pressed={websiteJobsOpen}
            className="flex h-9 items-center rounded-app border border-app-border px-2.5 text-[12.5px] font-medium text-app-muted transition-colors hover:bg-app-hover hover:text-app-text active:scale-[0.96]"
          >
            Sites
          </button>
          <ThemeToggle />
        </div>
      </header>

      <SetupNotice quota={quota} firstRun={history.length === 0} />

      <StatusBar search={search} error={error} resultCount={results.length} />

      <div className="flex min-h-0 flex-1">
        <div
          className={`min-w-0 basis-[55%] border-r border-app-border ${
            websiteJobsOpen ? "hidden sm:block" : ""
          }`}
        >
          <ResultsMap
            center={search ? { lat: search.lat, lng: search.lng } : null}
            radiusM={search?.radiusM ?? null}
            results={visible}
            selectedId={selectedId}
            onSelect={selectFromMap}
          />
        </div>

        {/* Le panneau prend la place de la liste, jamais celle de la carte. */}
        <div
          className={`min-w-0 bg-app-surface ${
            websiteJobsOpen ? "basis-full sm:basis-[45%]" : "basis-[45%]"
          }`}
        >
          {websiteJobsOpen ? (
            <WebsiteJobsPanel onClose={() => setWebsiteJobsOpen(false)} />
          ) : openedId ? (
            <ProspectPanel
              key={openedId}
              prospectId={openedId}
              onClose={() => setOpenedId(null)}
              onProspectUpdate={patchResult}
            />
          ) : search ? (
            <div className="flex h-full flex-col">
              {results.length > 0 && (
                <ResultsToolbar
                  results={results}
                  visibleResults={visible}
                  shown={visible.length}
                  searchId={search.id}
                  sort={sort}
                  onSortChange={setSort}
                  activeTiers={activeTiers}
                  onToggleTier={toggleTier}
                  hideOptOut={hideOptOut}
                  onHideOptOutChange={setHideOptOut}
                  hideIgnored={hideIgnored}
                  onHideIgnoredChange={setHideIgnored}
                  contactFilter={contactFilter}
                  onContactFilterChange={setContactFilter}
                  selectedWebsiteIds={websiteSelection}
                  onAddVisibleToWebsiteSelection={addVisibleToWebsiteSelection}
                  onClearWebsiteSelection={clearWebsiteSelection}
                  onGenerateWebsites={() => void generateWebsites()}
                  generatingWebsites={generatingWebsites}
                  websiteGenerationMessage={websiteGenerationMessage}
                />
              )}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {results.length === 0 && running ? (
                  <ResultsSkeleton />
                ) : (
                  <ResultsList
                    results={visible}
                    selectedId={selectedId}
                    onSelect={selectFromList}
                    onOpen={(id) => {
                      setWebsiteJobsOpen(false);
                      setOpenedId(id);
                    }}
                    autoScroll={selection.from === "map"}
                    websiteSelection={websiteSelection}
                    onToggleWebsiteSelection={toggleWebsiteSelection}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <EmptyState />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBar({
  search,
  error,
  resultCount,
}: {
  search: SearchSummary | null;
  error: AppError | null;
  resultCount: number;
}) {
  if (error) {
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-app-border bg-app-surface px-5 py-2 text-[12.5px] text-app-ko">
        <span>{error.message}</span>
        {error.retry && (
          <button
            type="button"
            onClick={error.retry}
            className="rounded-app border border-app-border px-2 py-0.5 font-medium text-app-ko hover:bg-app-hover"
          >
            Réessayer
          </button>
        )}
      </div>
    );
  }
  if (!search) return null;

  const { progress } = search;
  const done = search.status === "done";

  return (
    <div className="shrink-0 border-b border-app-border bg-app-surface px-5 py-2">
      <div className="flex items-center gap-3 text-[12.5px] text-app-muted">
        <span className="font-medium text-app-text">{search.label}</span>
        <span className="tnum">rayon {formatRadius(search.radiusM)}</span>
        <span>·</span>
        <span>{progress.message}</span>
        <span className="ml-auto tnum">
          {resultCount} prospect{resultCount > 1 ? "s" : ""}
        </span>
      </div>
      {!done && (
        <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-app-border">
          <div
            className="h-full rounded-full bg-app-accent transition-[width] duration-500"
            style={{ width: `${Math.round(progressRatio(search) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Les trois étapes ne durent pas pareil : la barre les pondère grossièrement. */
function progressRatio(search: SearchSummary): number {
  const { progress } = search;
  if (search.status === "done") return 1;
  if (progress.sectorsTotal === 0) return 0;

  switch (progress.phase) {
    case "search":
      return (progress.sectorsDone / progress.sectorsTotal) * 0.4;
    case "details":
      return 0.5;
    case "analyze":
      return 0.6 + 0.4 * (progress.analyzed / Math.max(1, progress.candidates));
    default:
      return 0;
  }
}

function EmptyState() {
  return (
    <div className="px-6 py-10 text-[13px] text-app-muted">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-app-border text-app-muted">
        <RadarIcon size={20} />
      </div>
      <p className="mb-3 text-[15px] font-semibold tracking-tight text-balance text-app-text">
        Prêt à balayer une zone.
      </p>
      <p className="mb-2 text-pretty">
        Indiquez une ville, un rayon et les secteurs à balayer, puis lancez le
        balayage. Les prospects apparaissent au fil de l’analyse, triés du plus
        au moins prometteur.
      </p>
      <p className="text-pretty">
        Le score mesure ce qu’une refonte apporterait : un score élevé signale
        un site absent, mort, obsolète — sur une entreprise qui, elle, marche.
      </p>
      <p className="mt-4 text-[12.5px]">
        Astuce : appuyez sur{" "}
        <kbd className="rounded border border-app-border px-1 py-0.5 text-[11px] text-app-text">
          /
        </kbd>{" "}
        pour cibler le champ de recherche.
      </p>
    </div>
  );
}
