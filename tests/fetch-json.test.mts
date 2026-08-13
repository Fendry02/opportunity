import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ApiError, describeError, fetchJson } from "../lib/fetch-json";

/**
 * On remplace `fetch` global par une réponse (ou un rejet) contrôlé, puis on
 * vérifie que chaque cas d'échec devient une `ApiError` au message lisible.
 */
const realFetch = globalThis.fetch;

function stubFetch(impl: () => Promise<Response>) {
  globalThis.fetch = impl as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchJson", () => {
  it("renvoie le JSON quand la réponse est ok", async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ value: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const data = await fetchJson<{ value: number }>("/api/x");
    assert.equal(data.value, 42);
  });

  it("traduit une coupure réseau en message présentable", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    await assert.rejects(fetchJson("/api/x"), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.match(err.message, /Connexion au serveur impossible/);
      assert.equal(err.status, undefined);
      return true;
    });
  });

  it("préfère le message d'erreur renvoyé par l'API", async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ error: "Ville introuvable" }), {
        status: 400,
      }),
    );

    await assert.rejects(fetchJson("/api/searches"), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.message, "Ville introuvable");
      assert.equal(err.status, 400);
      return true;
    });
  });

  it("retombe sur un message par statut quand le corps est vide", async () => {
    stubFetch(async () => new Response(null, { status: 404 }));

    await assert.rejects(fetchJson("/api/prospects/x"), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.message, "Ressource introuvable.");
      assert.equal(err.status, 404);
      return true;
    });
  });

  it("signale une réponse ok mais illisible", async () => {
    stubFetch(async () => new Response("pas du json", { status: 200 }));

    await assert.rejects(fetchJson("/api/x"), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.match(err.message, /illisible/);
      return true;
    });
  });
});

describe("describeError", () => {
  it("laisse passer le message d'une ApiError", () => {
    assert.equal(describeError(new ApiError("Boom", 500)), "Boom");
  });

  it("donne un repli pour une exception inconnue", () => {
    assert.match(describeError(new Error("brut")), /erreur inattendue/);
  });
});
