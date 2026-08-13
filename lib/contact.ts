import { CONTACT_STATUS_ORDER } from "./contact-labels";
import { getDb } from "./db";
import type { ContactStatus } from "./types";

/**
 * Suivi de la prise de contact, écrit sur l'établissement (table `businesses`).
 *
 * C'est le seul endroit, avec le pipeline, à écrire en base ; `queries.ts`
 * reste en lecture seule. Le statut est porté par le prospect, pas par un
 * balayage : il le suit donc d'une recherche à l'autre.
 *
 * Ce module touche à SQLite : ne l'importe jamais depuis un composant client.
 * Les libellés partagés vivent dans `contact-labels.ts`, sans accès base.
 */

export { CONTACT_STATUS_LABEL, CONTACT_STATUS_ORDER } from "./contact-labels";

export const CONTACT_STATUSES = CONTACT_STATUS_ORDER;

export function isContactStatus(value: unknown): value is ContactStatus {
  return (
    typeof value === "string" &&
    (CONTACT_STATUS_ORDER as string[]).includes(value)
  );
}

/** NULL en base (jamais marqué) vaut « à contacter ». */
export function normalizeContactStatus(
  value: string | null | undefined,
): ContactStatus {
  return isContactStatus(value) ? value : "to_contact";
}

/** Met à jour le statut ; renvoie `false` si l'établissement n'existe pas. */
export function setContactStatus(
  businessId: string,
  status: ContactStatus,
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE businesses
          SET contact_status = ?, contact_updated_at = datetime('now')
        WHERE id = ?`,
    )
    .run(status, businessId);
  return result.changes > 0;
}
