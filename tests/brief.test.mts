import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSweepBrief } from "../lib/brief";
import type { ProspectDetail } from "../lib/types";

/** Fiche minimale : les champs non testés restent neutres. */
function detail(over: Partial<ProspectDetail>): ProspectDetail {
  return {
    id: over.id ?? "x",
    name: over.name ?? "Test",
    sector: "plombier",
    sectorLabel: "Plombier",
    googleTypes: [],
    primaryType: null,
    lat: 0,
    lng: 0,
    address: null,
    phone: null,
    websiteUrl: null,
    rating: null,
    reviewCount: null,
    openingHours: [],
    businessStatus: null,
    detailsFetchedAt: null,
    score: 50,
    tier: "mid",
    optOut: null,
    contactStatus: "to_contact",
    ignored: false,
    breakdown: [],
    analysis: null,
    enrichment: null,
    searches: [],
    ...over,
  };
}

describe("export d'un balayage entier", () => {
  it("titre et sommaire du balayage", () => {
    const md = buildSweepBrief("Tours", [
      detail({ id: "a", name: "Alpha", score: 80, tier: "high" }),
    ]);
    assert.match(md, /^# Briefs — Tours/);
    assert.match(md, /## Sommaire/);
    assert.match(md, /1\. Alpha — 80\/100/);
    assert.match(md, /# Alpha/); // le brief complet est inclus
  });

  it("écarte les non notés et les refus de démarchage", () => {
    const md = buildSweepBrief("Lyon", [
      detail({ id: "a", name: "Notee", score: 70, tier: "high" }),
      detail({ id: "b", name: "SansScore", score: null, tier: null }),
      detail({ id: "c", name: "Ecartee", optOut: "Refus de démarchage" }),
    ]);
    assert.match(md, /Notee/);
    assert.doesNotMatch(md, /SansScore/);
    assert.doesNotMatch(md, /Ecartee/);
    assert.match(md, /1 prospect à contacter/);
  });

  it("classe le sommaire par score décroissant", () => {
    const md = buildSweepBrief("Nantes", [
      detail({ id: "a", name: "Basse", score: 30, tier: "low" }),
      detail({ id: "b", name: "Haute", score: 90, tier: "high" }),
    ]);
    assert.ok(
      md.indexOf("1. Haute") < md.indexOf("2. Basse"),
      "le plus haut score doit passer en premier",
    );
  });

  it("message clair quand rien n'est à briefer", () => {
    const md = buildSweepBrief("Vide", [
      detail({ id: "c", name: "Ecartee", optOut: "Refus de démarchage" }),
    ]);
    assert.match(md, /Aucun prospect à briefer/);
  });
});
