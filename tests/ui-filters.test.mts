/**
 * Tri et filtres de la liste de résultats — logique pure, sans React.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFilters } from "../components/ResultsToolbar";
import { formatDistance, formatRadius } from "../lib/format";
import type { ProspectSummary } from "../lib/types";

function prospect(over: Partial<ProspectSummary>): ProspectSummary {
  return {
    id: over.id ?? "x",
    name: over.name ?? "Test",
    sector: "plombier",
    sectorLabel: "Plombier",
    lat: 48,
    lng: -1,
    address: null,
    phone: null,
    websiteUrl: null,
    rating: null,
    reviewCount: null,
    distanceM: 500,
    score: null,
    tier: null,
    optOut: null,
    siteState: "alive",
    flags: null,
    ...over,
  };
}

const sample: ProspectSummary[] = [
  prospect({ id: "a", name: "Haut", score: 92, tier: "high", distanceM: 900 }),
  prospect({ id: "b", name: "Moyen", score: 52, tier: "mid", distanceM: 200 }),
  prospect({ id: "c", name: "Bas", score: 15, tier: "none", distanceM: 100 }),
  prospect({ id: "d", name: "Écarté", optOut: "Refus de démarchage", distanceM: 50 }),
  prospect({ id: "e", name: "En cours", distanceM: 300 }),
];

const ids = (rows: ProspectSummary[]) => rows.map((r) => r.id);

describe("tri des résultats", () => {
  it("classe par score décroissant par défaut", () => {
    const rows = applyFilters(sample, {
      sort: "score",
      activeTiers: [],
      hideOptOut: false,
    });
    assert.deepEqual(ids(rows), ["a", "b", "c", "e", "d"]);
  });

  it("classe par distance sans remonter les non notés ni les écartés", () => {
    const rows = applyFilters(sample, {
      sort: "distance",
      activeTiers: [],
      hideOptOut: false,
    });
    // « d » (50 m) et « e » (300 m) sont les plus proches mais restent en fin
    // de liste : l'un est écarté, l'autre pas encore analysé. Le tri par
    // distance ne s'applique qu'aux prospects exploitables.
    assert.deepEqual(ids(rows), ["c", "b", "a", "e", "d"]);
  });

  it("départage deux scores égaux par la distance", () => {
    const rows = applyFilters(
      [
        prospect({ id: "loin", score: 80, tier: "high", distanceM: 4000 }),
        prospect({ id: "pres", score: 80, tier: "high", distanceM: 100 }),
      ],
      { sort: "score", activeTiers: [], hideOptOut: false },
    );
    assert.deepEqual(ids(rows), ["pres", "loin"]);
  });
});

describe("filtres", () => {
  it("ne filtre rien quand aucun palier n'est actif", () => {
    assert.equal(
      applyFilters(sample, { sort: "score", activeTiers: [], hideOptOut: false })
        .length,
      sample.length,
    );
  });

  it("retient les paliers demandés", () => {
    const rows = applyFilters(sample, {
      sort: "score",
      activeTiers: ["high", "mid"],
      hideOptOut: false,
    });
    // Les écartés échappent au filtre par couleur : ils n'ont pas de palier.
    assert.deepEqual(ids(rows), ["a", "b", "d"]);
  });

  it("masque les écartés à la demande", () => {
    const rows = applyFilters(sample, {
      sort: "score",
      activeTiers: [],
      hideOptOut: true,
    });
    assert.ok(!ids(rows).includes("d"));
    assert.equal(rows.length, 4);
  });

  it("combine palier et masquage", () => {
    const rows = applyFilters(sample, {
      sort: "score",
      activeTiers: ["high"],
      hideOptOut: true,
    });
    assert.deepEqual(ids(rows), ["a"]);
  });

  it("ne modifie pas le tableau d'origine", () => {
    const before = ids(sample);
    applyFilters(sample, { sort: "distance", activeTiers: [], hideOptOut: false });
    assert.deepEqual(ids(sample), before);
  });
});

describe("formatage des distances", () => {
  it("passe des mètres aux kilomètres", () => {
    assert.equal(formatDistance(100), "100 m");
    assert.equal(formatDistance(999), "999 m");
    assert.equal(formatDistance(1000), "1,0 km");
    assert.equal(formatDistance(2637), "2,6 km");
  });

  it("reste lisible pour les petits rayons", () => {
    assert.equal(formatRadius(100), "100 m");
    assert.equal(formatRadius(20000), "20,0 km");
  });
});
