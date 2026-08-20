import { extractColors } from "../analyzer/colors";
import { fetchPage, isDead } from "../analyzer/fetch-site";
import { getDb } from "../db";
import { setDiscoveredOutreachEmail } from "../outreach";
import { getProspect, getRawSignals } from "../queries";
import type { EnrichmentView } from "../types";
import { lookupCompany } from "./gouv";
import { findLegalNotice } from "./mentions-legales";
import { findPublicEmail } from "./public-email";
import { deduceServices } from "./services";

/**
 * Enrichissement à la demande d'un prospect (bouton de la fiche), exécuté de
 * façon synchrone : trois ou quatre requêtes gratuites, quelques secondes.
 *
 * Ordre volontaire : les mentions légales d'abord, car un SIRET y fait
 * autorité et lève les homonymies de l'API gouv.
 */

export async function enrichProspect(businessId: string): Promise<EnrichmentView> {
  const prospect = getProspect(businessId);
  if (!prospect) throw new Error("Prospect introuvable");

  const raw = getRawSignals(businessId);
  const siteUrl = prospect.analysis?.reachable ? prospect.websiteUrl : null;

  const homepage = siteUrl ? await homepageHtml(siteUrl) : undefined;

  // 1. Mentions légales (dirigeant + SIRET faisant foi).
  const legal = siteUrl ? await findLegalNotice(siteUrl, homepage) : null;

  // 2. Adresse de contact publiée sur le site. Elle est conservée séparément
  // des données de l'entreprise et ne remplace jamais une saisie manuelle.
  const publicEmail = siteUrl ? await findPublicEmail(siteUrl, homepage) : null;
  if (publicEmail) setDiscoveredOutreachEmail(businessId, publicEmail);

  // 3. API gouv, contrainte par le code postal extrait de l'adresse Google.
  const postcode = extractPostcode(prospect.address);
  const company = await lookupCompany({
    name: prospect.name,
    postcode,
    siretHint: legal?.siret ?? null,
  }).catch(() => null);

  // 4. Palette du site actuel.
  const colors = siteUrl
    ? await extractColors({
        inlineColors: raw?.inlineColors ?? [],
        cssUrls: raw?.cssUrls ?? [],
      })
    : [];

  // 5. Prestations déduites des textes déjà collectés (aucun fetch de plus).
  const services = deduceServices({
    navLabels: raw?.navLabels ?? [],
    headings: raw?.headings ?? [],
    sectorId: prospect.sector,
    primaryType: prospect.primaryType,
  });

  // L'API gouv est plus fiable que le scraping ; les mentions légales
  // complètent quand elle ne renvoie pas de dirigeant.
  const dirigeantName = company?.dirigeantName ?? legal?.dirigeantName ?? null;
  const dirigeantRole = company?.dirigeantName
    ? company.dirigeantRole
    : (legal?.dirigeantRole ?? null);
  const dirigeantSource: EnrichmentView["dirigeantSource"] = dirigeantName
    ? company?.dirigeantName
      ? "gouv"
      : "mentions_legales"
    : null;

  const enrichment: EnrichmentView = {
    siren: company?.siren || legal?.siren || null,
    siret: legal?.siret ?? company?.siret ?? null,
    legalForm: company?.legalForm ?? null,
    naf: company?.naf ?? null,
    nafLabel: company?.nafLabel ?? null,
    creationDate: company?.creationDate ?? null,
    dirigeantName,
    dirigeantRole,
    dirigeantSource,
    services,
    colors,
    socials: prospect.analysis?.socials ?? [],
    fetchedAt: new Date().toISOString(),
  };

  save(businessId, enrichment);
  return enrichment;
}

async function homepageHtml(siteUrl: string): Promise<string | undefined> {
  const page = await fetchPage(siteUrl);
  return isDead(page) ? undefined : page.html;
}

/** Le code postal départage les homonymes côté API gouv. */
export function extractPostcode(address: string | null): string {
  return /\b(\d{5})\b/.exec(address ?? "")?.[1] ?? "";
}

function save(businessId: string, e: EnrichmentView): void {
  getDb()
    .prepare(
      `INSERT INTO enrichments (
         business_id, siren, siret, legal_form, naf, naf_label, creation_date,
         dirigeant_name, dirigeant_role, dirigeant_source, services_json,
         colors_json, socials_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(business_id) DO UPDATE SET
         siren = excluded.siren, siret = excluded.siret,
         legal_form = excluded.legal_form, naf = excluded.naf,
         naf_label = excluded.naf_label, creation_date = excluded.creation_date,
         dirigeant_name = excluded.dirigeant_name,
         dirigeant_role = excluded.dirigeant_role,
         dirigeant_source = excluded.dirigeant_source,
         services_json = excluded.services_json,
         colors_json = excluded.colors_json,
         socials_json = excluded.socials_json,
         fetched_at = datetime('now')`,
    )
    .run(
      businessId,
      e.siren,
      e.siret,
      e.legalForm,
      e.naf,
      e.nafLabel,
      e.creationDate,
      e.dirigeantName,
      e.dirigeantRole,
      e.dirigeantSource,
      JSON.stringify(e.services),
      JSON.stringify(e.colors),
      JSON.stringify(e.socials),
    );
}
