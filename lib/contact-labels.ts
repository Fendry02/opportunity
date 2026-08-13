import type { ContactStatus } from "./types";

/**
 * Libellés et ordre des statuts de suivi — module pur, sans accès base, pour
 * être importable côté client (l'UI) comme côté serveur (`lib/contact.ts`).
 */

export const CONTACT_STATUS_ORDER: ContactStatus[] = [
  "to_contact",
  "contacted",
  "not_interested",
  "client",
];

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  to_contact: "À contacter",
  contacted: "Contacté",
  not_interested: "Pas intéressé",
  client: "Client",
};
