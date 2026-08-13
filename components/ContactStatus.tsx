"use client";

import {
  CONTACT_STATUS_LABEL,
  CONTACT_STATUS_ORDER,
} from "@/lib/contact-labels";
import type { ContactStatus } from "@/lib/types";

/**
 * Suivi de la prise de contact : un menu dans la fiche pour le régler, une
 * pastille discrète dans la liste pour le repérer d'un coup d'œil.
 */

/** Menu de la fiche prospect. */
export function ContactStatusControl({
  status,
  disabled = false,
  onChange,
}: {
  status: ContactStatus;
  disabled?: boolean;
  onChange: (next: ContactStatus) => void;
}) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-app border border-app-border bg-app-surface px-2.5 text-sm">
      <span className="text-[12.5px] text-app-muted">Suivi</span>
      <select
        value={status}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ContactStatus)}
        aria-label="Statut de prise de contact"
        className="bg-transparent text-sm disabled:opacity-50"
      >
        {CONTACT_STATUS_ORDER.map((value) => (
          <option key={value} value={value}>
            {CONTACT_STATUS_LABEL[value]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Une pastille de couleur seulement là où elle porte du sens. */
const STATUS_DOT: Partial<Record<ContactStatus, string>> = {
  contacted: "var(--app-accent)",
  client: "var(--app-ok)",
};

/** Pastille de la liste : rien à afficher pour l'état par défaut. */
export function ContactStatusChip({ status }: { status: ContactStatus }) {
  if (status === "to_contact") return null;
  const dot = STATUS_DOT[status];

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-app-border px-1.5 py-0.5 text-[11px] text-app-muted">
      {dot && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: dot }}
        />
      )}
      {CONTACT_STATUS_LABEL[status]}
    </span>
  );
}
