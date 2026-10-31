/**
 * Tests de la source Scavio : traduction vers la forme Places, requête
 * envoyée, pagination et relances. Aucun réseau : la fixture
 * `scavio_maps/plombier-tours.json` reprend le jeu de démo Places dans le
 * format réel de l'API, et `fetch` est remplacé quand il faut voir la requête.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";

process.env.MOCK_EXTERNAL = "1";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opportunity-scavio-"));
process.env.OPPORTUNITY_DB_PATH = path.join(tmp, "scavio.db");

const { mapCenter, scavioSearchBody, scavioSelected, searchScavio } = await import(
  "../lib/places/scavio"
);

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "fixtures/scavio_maps/plombier-tours.json"), "utf8"),
) as { local_results: Record<string, unknown>[] };

const tours = { lat: 47.3879, lng: 0.689, radiusM: 5000 };

describe("traduction d'une réponse Scavio (mode mock)", () => {
  it("rend la même forme que les fixtures Places pour le jeu de démo", async () => {
    const places = await searchScavio({
      textQuery: "plombier à Tours",
      ...tours,
      fixture: "plombier-tours.json",
    });
    assert.equal(places.length, 6);

    const atlas = places.find((p) => p.id === "mock_plomberie_atlas")!;
    assert.deepEqual(atlas.location, { latitude: 47.3899, longitude: 0.691 });
    assert.equal(atlas.displayName?.text, "Plomberie Atlas");
    assert.equal(atlas.formattedAddress, "21 rue Marceau, 37000 Tours");
    assert.equal(atlas.primaryType, "Plombier");
    assert.equal(atlas.businessStatus, "OPERATIONAL");
    // Pas de site : c'est le prospect « sans site » de la démo.
    assert.equal(atlas.details?.websiteUri, undefined);
    assert.equal(atlas.details?.nationalPhoneNumber, "01 00 00 00 00");
    assert.equal(atlas.details?.rating, 4.6);
    assert.equal(atlas.details?.userRatingCount, 38);

    const horizon = places.find((p) => p.id === "mock_plomberie_horizon")!;
    assert.equal(horizon.details?.websiteUri, "https://www.plomberie-horizon.fr/");
  });

  it("ordonne les horaires du lundi au dimanche, au format Places", async () => {
    const [atlas] = await searchScavio({
      textQuery: "plombier à Tours",
      ...tours,
      fixture: "plombier-tours.json",
    });
    assert.deepEqual(atlas.details?.regularOpeningHours?.weekdayDescriptions, [
      "lundi: 08:00–18:00",
      "mardi: 08:00–18:00",
      "mercredi: 08:00–18:00",
      "jeudi: 08:00–18:00",
      "vendredi: 08:00–17:00",
      "samedi: Fermé",
      "dimanche: Fermé",
    ]);
  });

  it("repère un établissement définitivement fermé", async () => {
    const places = await searchScavio({
      textQuery: "plombier à Tours",
      ...tours,
      fixture: "plombier-tours.json",
    });
    const closed = places.find((p) => p.id === "mock_plomberie_fermee")!;
    assert.equal(closed.businessStatus, "CLOSED_PERMANENTLY");
  });

  it("n'est jamais choisi en mode mock : la démo reste sur Places", () => {
    process.env.SCAVIO_API_KEY = "sk_test";
    try {
      assert.equal(scavioSelected(), false);
    } finally {
      delete process.env.SCAVIO_API_KEY;
    }
  });
});

describe("requête envoyée", () => {
  it("centre toujours la carte sur la commune, en français", () => {
    const body = JSON.parse(
      scavioSearchBody({ textQuery: "plombier à Tours", ...tours }, 0),
    );
    assert.deepEqual(body, {
      query: "plombier à Tours",
      ll: "@47.38790,0.68900,13z",
      hl: "fr",
      gl: "fr",
    });
    const next = JSON.parse(scavioSearchBody({ textQuery: "x", ...tours }, 2));
    assert.equal(next.start, 40);
  });

  it("convertit le rayon en zoom, borné entre 10 et 16", () => {
    assert.match(mapCenter(0, 0, 5000), /,13z$/);
    assert.match(mapCenter(0, 0, 50_000), /,10z$/);
    assert.match(mapCenter(0, 0, 100), /,16z$/);
  });
});

describe("choix du fournisseur", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.MOCK_EXTERNAL = "1";
    process.env.GOOGLE_PLACES_API_KEY = saved.GOOGLE_PLACES_API_KEY ?? "";
    process.env.SCAVIO_API_KEY = saved.SCAVIO_API_KEY ?? "";
  });

  it("Places reste le défaut quand les deux clés sont présentes", () => {
    process.env.MOCK_EXTERNAL = "0";
    process.env.GOOGLE_PLACES_API_KEY = "g";
    process.env.SCAVIO_API_KEY = "s";
    assert.equal(scavioSelected(), false);
  });

  it("Scavio est choisi quand c'est la seule clé", () => {
    process.env.MOCK_EXTERNAL = "0";
    process.env.GOOGLE_PLACES_API_KEY = "";
    process.env.SCAVIO_API_KEY = "s";
    assert.equal(scavioSelected(), true);
  });
});

describe("appels réseau (fetch simulé)", () => {
  const realFetch = globalThis.fetch;
  let calls: { url: string; init: RequestInit }[] = [];

  /** Répond avec la file de réponses donnée, une par appel. */
  function stub(responses: (() => Response)[]): void {
    calls = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("appel inattendu");
      return next();
    }) as typeof fetch;
  }

  const json = (status: number, body: unknown) => () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  /** Une page pleine : 20 copies du premier résultat, ids distincts. */
  const fullPage = (prefix: string) => ({
    local_results: Array.from({ length: 20 }, (_, i) => ({
      ...FIXTURE.local_results[0],
      place_id: `${prefix}_${i}`,
    })),
  });

  const timeout = () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  };

  const run = (textQuery: string) =>
    searchScavio({ textQuery, ...tours });

  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env.MOCK_EXTERNAL = "1";
    delete process.env.SCAVIO_API_KEY;
  });

  const live = () => {
    process.env.MOCK_EXTERNAL = "0";
    process.env.SCAVIO_API_KEY = "sk_test_cle";
  };

  it("envoie la clé en Bearer, pagine tant que la page est pleine, sans doublon", async () => {
    live();
    const first = fullPage("a");
    // La page 2 répète un lieu de la page 1, comme Maps le fait parfois.
    const second = { local_results: [first.local_results[19], ...FIXTURE.local_results.slice(0, 3)] };
    stub([json(200, first), json(200, second)]);
    const places = await run("plombier à Tours (pagination)");

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://api.scavio.dev/api/v2/google/maps/search");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer sk_test_cle");
    assert.equal(JSON.parse(String(calls[0].init.body)).start, undefined);
    assert.equal(JSON.parse(String(calls[1].init.body)).start, 20);
    assert.equal(places.length, 23);
  });

  it("relit le cache au lieu de repayer la même page", async () => {
    live();
    stub([json(200, { local_results: FIXTURE.local_results.slice(0, 2) })]);
    await run("plombier à Tours (cache)");
    stub([]);
    const again = await run("plombier à Tours (cache)");
    assert.equal(calls.length, 0);
    assert.equal(again.length, 2);
  });

  it("relance une fois après un 5xx", async () => {
    live();
    stub([json(503, { error: "Service unavailable" }), json(200, { local_results: [] })]);
    const places = await run("plombier à Tours (5xx)");
    assert.equal(calls.length, 2);
    assert.deepEqual(places, []);
  });

  it("relance une fois après un timeout, puis échoue clairement", async () => {
    live();
    stub([timeout, timeout]);
    await assert.rejects(run("plombier à Tours (timeout)"), /timeout après 30000 ms/);
    assert.equal(calls.length, 2);
  });

  it("explique une clé refusée, et ne la garde pas en cache", async () => {
    live();
    stub([json(401, { error: "Invalid or missing API key" })]);
    await assert.rejects(run("plombier à Tours (401)"), /SCAVIO_API_KEY/);
    assert.equal(calls.length, 1);

    // Clé corrigée : le 401 relu du cache est ignoré, l'appel repart.
    stub([json(200, { local_results: FIXTURE.local_results.slice(0, 1) })]);
    const places = await run("plombier à Tours (401)");
    assert.equal(calls.length, 1);
    assert.equal(places.length, 1);
  });

  it("garde les premières pages si une page suivante échoue", async () => {
    live();
    stub([json(200, fullPage("b")), json(500, {}), json(500, {})]);
    const places = await run("plombier à Tours (page 2 en échec)");
    assert.equal(places.length, 20);
    assert.equal(calls.length, 3);
  });
});
