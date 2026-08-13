"use client";

import type { Quota } from "@/lib/types";

/**
 * Bandeau d'accueil qui s'adapte à l'environnement, sous le header.
 *
 * Deux cas valent la peine d'un mot :
 *  - mode réel sans clé : les balayages échoueront, on prévient avant le clic ;
 *  - mode démo au tout premier lancement : on explique ce qu'on regarde et
 *    comment passer à ses vraies zones. Il disparaît dès la première recherche.
 */
export function SetupNotice({
  quota,
  firstRun,
}: {
  quota: Quota | null;
  firstRun: boolean;
}) {
  if (!quota) return null;

  if (!quota.mock && !quota.configured) {
    return (
      <div className="shrink-0 border-b border-app-border bg-app-surface px-5 py-2 text-[12.5px]">
        <span className="font-medium text-app-ko">Clé Google Places absente.</span>{" "}
        <span className="text-app-muted">
          Les balayages échoueront tant que <Code>GOOGLE_PLACES_API_KEY</Code>{" "}
          n’est pas renseignée dans <Code>.env.local</Code> — ou repassez en démo
          avec <Code>MOCK_EXTERNAL=1</Code>.
        </span>
      </div>
    );
  }

  if (quota.mock && firstRun) {
    return (
      <div className="shrink-0 border-b border-app-border bg-app-surface px-5 py-2 text-[12.5px] text-app-muted">
        <span className="font-medium text-app-text">Mode démo.</span> Aucun appel
        réseau : seule « Tours » dispose de données. Pour balayer vos vraies
        zones, ajoutez une clé Google Places dans <Code>.env.local</Code>, puis{" "}
        <Code>MOCK_EXTERNAL=0</Code>.
      </div>
    );
  }

  return null;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-app-hover px-1 py-0.5 text-[11px] text-app-text">
      {children}
    </code>
  );
}
