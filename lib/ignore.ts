import { getDb, int } from "./db";

/**
 * « Ignorer » un prospect : un écart manuel, porté par l'établissement (comme
 * le suivi de contact, il suit donc l'établissement d'un balayage à l'autre).
 *
 * Distinct du refus de démarchage (auto-détecté, non noté) et du statut « pas
 * intéressé » : c'est un simple « écarte-le de ma vue » réversible.
 */
export function setIgnored(businessId: string, ignored: boolean): void {
  getDb()
    .prepare(`UPDATE businesses SET ignored = ? WHERE id = ?`)
    .run(int(ignored), businessId);
}
