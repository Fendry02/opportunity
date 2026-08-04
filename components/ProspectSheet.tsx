"use client";

import Link from "next/link";
import { ProspectDetailView } from "./ProspectDetailView";
import type { ProspectDetail } from "@/lib/types";

/**
 * Page fiche prospect : blanche, aérée, sections séparées par de simples
 * filets. Même contenu que le panneau latéral de la carte.
 */
export function ProspectSheet({ initial }: { initial: ProspectDetail }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/"
        className="text-[12.5px] text-app-muted hover:text-app-accent"
      >
        ← Retour aux résultats
      </Link>
      <div className="mt-4">
        <ProspectDetailView initial={initial} variant="page" />
      </div>
    </div>
  );
}
