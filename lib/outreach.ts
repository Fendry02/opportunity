import { getDb } from "./db";
import type {
  OutreachEmailDraft,
  OutreachEmailSource,
  OutreachMethod,
  OutreachPlan,
} from "./types";

export const OUTREACH_METHODS: OutreachMethod[] = ["visit", "email"];
const QUOTE_AMOUNT_EUROS = 1_000;
const QUOTE_VALIDITY_DAYS = 30;

export function isOutreachMethod(value: unknown): value is OutreachMethod {
  return typeof value === "string" && OUTREACH_METHODS.includes(value as OutreachMethod);
}

export function getOutreachPlan(businessId: string): OutreachPlan | null {
  const row = getDb()
    .prepare<
      [string],
      {
        outreach_method: string | null;
        outreach_email: string | null;
        outreach_email_source: string | null;
      }
    >(
      `SELECT outreach_method, outreach_email, outreach_email_source
         FROM businesses
        WHERE id = ?`,
    )
    .get(businessId);
  return row ? toOutreachPlan(row) : null;
}

export function setOutreachPlan(
  businessId: string,
  plan: { method: OutreachMethod; recipientEmail?: string | null },
): OutreachPlan | null {
  const email = plan.recipientEmail?.trim() || null;
  const current = getOutreachPlan(businessId);
  if (!current) return null;
  const source = email
    ? email === current.recipientEmail
      ? current.recipientEmailSource ?? "manual"
      : "manual"
    : null;
  const result = getDb()
    .prepare(
      `UPDATE businesses
          SET outreach_method = ?, outreach_email = ?, outreach_email_source = ?
        WHERE id = ?`,
    )
    .run(plan.method, email, source, businessId);
  return result.changes > 0 ? getOutreachPlan(businessId) : null;
}

/**
 * Conserve une adresse publiée par l'entreprise sans jamais remplacer une
 * adresse entrée à la main. Une nouvelle découverte peut actualiser une source
 * publique déjà enregistrée.
 */
export function setDiscoveredOutreachEmail(
  businessId: string,
  recipientEmail: string,
): OutreachPlan | null {
  const email = recipientEmail.trim().toLowerCase();
  if (!email) return getOutreachPlan(businessId);
  getDb()
    .prepare(
      `UPDATE businesses
          SET outreach_email = ?, outreach_email_source = 'public_site'
        WHERE id = ?
          AND (outreach_email IS NULL OR outreach_email_source = 'public_site')`,
    )
    .run(email, businessId);
  return getOutreachPlan(businessId);
}

/** Brouillon interne, jamais expédié par l'application. */
export function buildEmailDraft(input: {
  businessName: string;
  siteUrl: string;
}): OutreachEmailDraft {
  return {
    subject: `Une nouvelle vitrine web pour ${input.businessName}`,
    body: [
      "Bonjour,",
      "",
      `J’ai préparé une proposition de nouvelle vitrine pour ${input.businessName}.`,
      "Vous pouvez la consulter ici :",
      input.siteUrl,
      "",
      `Le brouillon de devis prévoit une création de site à ${formatEuro(QUOTE_AMOUNT_EUROS)} HT, avec une validité de ${QUOTE_VALIDITY_DAYS} jours.`,
      "",
      "Je reste disponible pour en discuter.",
      "",
      "Bien cordialement,",
      "[Votre nom]",
    ].join("\n"),
  };
}

/** Document de travail : les mentions de l'émetteur restent à compléter avant
 * toute émission, car elles dépendent de l'activité commerciale de l'utilisateur. */
export function buildQuoteDraft(input: {
  businessName: string;
  address: string | null;
}): string {
  return `# Brouillon de devis

> À compléter avant envoi : identité de l'émetteur, numéro de devis, SIREN,
> adresse, TVA, conditions de paiement et signature.

## Client

- ${input.businessName}
- ${input.address ?? "Adresse à confirmer"}

## Prestation

| Désignation | Quantité | Prix HT |
| --- | ---: | ---: |
| Création d’un site vitrine professionnel | 1 | ${formatEuro(QUOTE_AMOUNT_EUROS)} HT |
| Mise en ligne Vercel | Incluse | 0 € |

**Total HT : ${formatEuro(QUOTE_AMOUNT_EUROS)}**

Validité du devis : ${QUOTE_VALIDITY_DAYS} jours.
`;
}

function toOutreachPlan(row: {
  outreach_method: string | null;
  outreach_email: string | null;
  outreach_email_source: string | null;
}): OutreachPlan {
  return {
    method: row.outreach_method === "email" ? "email" : "visit",
    recipientEmail: row.outreach_email,
    recipientEmailSource: normalizeEmailSource(row.outreach_email_source),
  };
}

function normalizeEmailSource(value: string | null): OutreachEmailSource | null {
  return value === "manual" || value === "public_site" ? value : null;
}

function formatEuro(amount: number): string {
  // L'espace insécable produit par Intl est parfait à l'affichage, mais rend
  // le Markdown moins lisible et moins portable dans un brouillon de devis.
  return `${new Intl.NumberFormat("fr-FR").format(amount).replace(/\s/g, " ")} €`;
}
