import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  buildWebsiteHtml,
  buildWebsitePrompt,
  createWebsiteProject,
} from "../lib/site-generation";
import type { ProspectDetail } from "../lib/types";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function prospect(over: Partial<ProspectDetail> = {}): ProspectDetail {
  return {
    id: "place-123",
    name: "Atelier & Fils",
    sector: "menuisier",
    sectorLabel: "Menuisier",
    googleTypes: [],
    primaryType: "carpenter",
    lat: 47.3899,
    lng: 0.691,
    address: "21 rue Nationale, 37000 Tours, France",
    phone: "02 47 00 00 00",
    websiteUrl: "https://atelier-fils.example",
    rating: 4.8,
    reviewCount: 42,
    openingHours: [],
    businessStatus: "OPERATIONAL",
    detailsFetchedAt: null,
    score: 81,
    tier: "high",
    optOut: null,
    contactStatus: "to_contact",
    ignored: false,
    breakdown: [],
    analysis: null,
    enrichment: {
      siren: null,
      siret: null,
      legalForm: null,
      naf: null,
      nafLabel: null,
      creationDate: null,
      dirigeantName: null,
      dirigeantRole: null,
      dirigeantSource: null,
      services: ["Agencement sur mesure", "Pose de menuiseries"],
      colors: [{ hex: "#1F6E5E", count: 8 }],
      socials: [],
      fetchedAt: "2026-08-19T10:00:00.000Z",
    },
    searches: [],
    ...over,
  };
}

describe("génération d'un site prospect", () => {
  it("produit un prompt actionnable et fidèle aux données disponibles", () => {
    const prompt = buildWebsitePrompt(
      prospect(),
      "/tmp/websites/atelier-fils",
    );

    assert.match(prompt, /\/tmp\/websites\/atelier-fils/);
    assert.match(prompt, /responsive/i);
    assert.match(prompt, /animations/i);
    assert.match(prompt, /avis Google/i);
    assert.match(prompt, /Google Maps/i);
    assert.match(prompt, /ne pas inventer/i);
    assert.match(prompt, /Agencement sur mesure/);
  });

  it("compose une vitrine responsive avec avis Google et carte", () => {
    const html = buildWebsiteHtml(prospect());

    assert.match(html, /Atelier &amp; Fils/);
    assert.match(html, /4,8\/5/);
    assert.match(html, /42 avis Google/);
    assert.match(html, /google\.com\/maps/);
    assert.match(html, /@media \(max-width: 760px\)/);
    assert.match(html, /IntersectionObserver/);
    assert.match(html, /Agencement sur mesure/);
  });

  it("crée un dossier autonome sans écraser une création précédente", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "opportunity-sites-"));
    tempDirs.push(rootDir);

    const first = createWebsiteProject(prospect(), { rootDir });
    const second = createWebsiteProject(prospect(), { rootDir });

    assert.equal(first.status, "created");
    assert.equal(second.status, "skipped");
    assert.ok(fs.existsSync(path.join(first.directory, "index.html")));
    assert.ok(fs.existsSync(path.join(first.directory, "PROMPT.md")));
    assert.ok(fs.existsSync(path.join(first.directory, "site.json")));
  });
});
