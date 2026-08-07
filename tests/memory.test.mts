/**
 * Tests de la mémoire des recherches : ce qui évite de repayer un appel Places.
 * Aucun réseau.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.MOCK_EXTERNAL = "1";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opportunity-mem-"));
process.env.OPPORTUNITY_DB_PATH = path.join(tmp, "mem.db");

const { searchCacheKey } = await import("../lib/places/client");
const { isFresh } = await import("../lib/pipeline");

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const base = {
  textQuery: "plombier à Tours",
  lat: 47.389154,
  lng: 0.692052,
  radiusM: 5000,
};

describe("clé de cache d'une recherche Places", () => {
  it("ignore les micro-écarts de centre (~100 m)", () => {
    // Deux adresses voisines dans la même rue : une seule réponse en cache.
    const a = searchCacheKey(base, 0);
    const b = searchCacheKey({ ...base, lat: 47.3891, lng: 0.69202 }, 0);
    assert.equal(a, b);
  });

  it("distingue deux centres réellement différents", () => {
    const a = searchCacheKey(base, 0);
    const b = searchCacheKey({ ...base, lat: 47.41, lng: 0.72 }, 0);
    assert.notEqual(a, b);
  });

  it("distingue rayon, requête et page", () => {
    const a = searchCacheKey(base, 0);
    assert.notEqual(a, searchCacheKey({ ...base, radiusM: 10000 }, 0));
    assert.notEqual(a, searchCacheKey({ ...base, textQuery: "coiffeur à Tours" }, 0));
    assert.notEqual(a, searchCacheKey(base, 1));
  });

  it("ne dépend pas de la casse ni des espaces de la requête", () => {
    assert.equal(
      searchCacheKey(base, 0),
      searchCacheKey({ ...base, textQuery: "  Plombier à TOURS " }, 0),
    );
  });

  it("plafonne le rayon comme l'API (50 km)", () => {
    assert.equal(
      searchCacheKey({ ...base, radiusM: 60_000 }, 0),
      searchCacheKey({ ...base, radiusM: 50_000 }, 0),
    );
  });
});

describe("fraîcheur des données déjà en base", () => {
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString();

  /** SQLite écrit `datetime('now')` en UTC, sans T ni Z. */
  const sqliteDaysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

  it("accepte le format ISO comme le format SQLite", () => {
    assert.equal(isFresh(daysAgo(1), 30), true);
    assert.equal(isFresh(sqliteDaysAgo(1), 30), true);
  });

  it("refuse au-delà de la fenêtre", () => {
    assert.equal(isFresh(daysAgo(31), 30), false);
    assert.equal(isFresh(sqliteDaysAgo(8), 7), false);
  });

  it("refuse une absence de date", () => {
    assert.equal(isFresh(null, 30), false);
  });

  it("refuse une date future (horloge incohérente)", () => {
    assert.equal(isFresh(daysAgo(-2), 30), false);
  });
});
