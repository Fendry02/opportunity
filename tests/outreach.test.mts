import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opportunity-outreach-"));
process.env.OPPORTUNITY_DB_PATH = path.join(tmp, "outreach.db");

const { getDb } = await import("../lib/db");
const {
  buildEmailDraft,
  buildQuoteDraft,
  getOutreachPlan,
  setDiscoveredOutreachEmail,
  setOutreachPlan,
} = await import("../lib/outreach");

beforeEach(() => {
  getDb().prepare("DELETE FROM businesses").run();
  getDb()
    .prepare(
      `INSERT INTO businesses (id, name, google_types_json, lat, lng, address)
       VALUES ('place-outreach', 'Atelier Rivoli', '[]', 47.394, 0.684, '12 rue Rivoli, Tours')`,
    )
    .run();
});

after(() => {
  getDb().close();
  delete (globalThis as { __opportunityDb?: unknown }).__opportunityDb;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("préparation commerciale", () => {
  it("distingue une visite d'un email et garde le destinataire", () => {
    const updated = setOutreachPlan("place-outreach", {
      method: "email",
      recipientEmail: "bonjour@atelier-rivoli.fr",
    });

    assert.deepEqual(updated, {
      method: "email",
      recipientEmail: "bonjour@atelier-rivoli.fr",
      recipientEmailSource: "manual",
    });
    assert.deepEqual(getOutreachPlan("place-outreach"), updated);
  });

  it("prépare un email avec le lien Vercel et un devis à 1 000 €", () => {
    const email = buildEmailDraft({
      businessName: "Atelier Rivoli",
      siteUrl: "https://atelier-rivoli.vercel.app",
    });
    const quote = buildQuoteDraft({
      businessName: "Atelier Rivoli",
      address: "12 rue Rivoli, Tours",
    });

    assert.match(email.subject, /Atelier Rivoli/);
    assert.match(email.body, /https:\/\/atelier-rivoli\.vercel\.app/);
    assert.match(email.body, /1 000 € HT/);
    assert.match(quote, /Brouillon de devis/);
    assert.match(quote, /Atelier Rivoli/);
    assert.match(quote, /1 000 € HT/);
    assert.match(quote, /30 jours/);
  });

  it("garde une adresse saisie à la main face à une nouvelle découverte", () => {
    const discovered = setDiscoveredOutreachEmail(
      "place-outreach",
      "contact@atelier-rivoli.fr",
    );
    assert.equal(discovered?.recipientEmailSource, "public_site");

    setOutreachPlan("place-outreach", {
      method: "email",
      recipientEmail: "direction@atelier-rivoli.fr",
    });
    const preserved = setDiscoveredOutreachEmail(
      "place-outreach",
      "bonjour@atelier-rivoli.fr",
    );
    assert.deepEqual(preserved, {
      method: "email",
      recipientEmail: "direction@atelier-rivoli.fr",
      recipientEmailSource: "manual",
    });
  });
});
