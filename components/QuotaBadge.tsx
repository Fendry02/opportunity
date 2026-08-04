"use client";

import type { Quota } from "@/lib/types";

/**
 * Consommation Places du jour, dans le header.
 *
 * Devient rouge à l'approche du plafond : le coût de l'outil se joue là,
 * autant qu'il soit sous les yeux en permanence.
 */
export function QuotaBadge({ quota }: { quota: Quota | null }) {
  if (!quota) return null;

  if (quota.mock) {
    return (
      <span
        className="rounded-app border border-app-border px-2 py-1 text-[12.5px] text-app-muted"
        title="MOCK_EXTERNAL=1 : aucun appel réseau n'est émis."
      >
        Mode simulé
      </span>
    );
  }

  const ratio = quota.used / quota.cap;
  const color =
    quota.remaining === 0
      ? "var(--app-ko)"
      : ratio >= 0.8
        ? "var(--score-mid)"
        : "var(--app-muted)";

  return (
    <span
      className="flex items-center gap-1.5 rounded-app border border-app-border px-2 py-1 text-[12.5px] tnum"
      style={{ color }}
      title={
        quota.remaining === 0
          ? "Plafond journalier atteint. Les balayages reprendront demain, ou après avoir relevé PLACES_DAILY_CAP."
          : `${quota.remaining} appels Places encore disponibles aujourd'hui.`
      }
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-10 overflow-hidden rounded-full"
        style={{ background: "var(--app-border)" }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }}
        />
      </span>
      {quota.used}/{quota.cap}
    </span>
  );
}
