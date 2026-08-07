import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { circleBounds, circlePolygon } from "../lib/map/circle";
import { OVERRIDDEN_LAYER_IDS, patchPositronStyle } from "../lib/map/style";

/** Latitude de Tours : le seul endroit qui compte pour les fixtures. */
const TOURS = { lat: 47.3941, lng: 0.6848 };

/**
 * Distance approchée en mètres entre deux points, avec la même approximation
 * plate que `circlePolygon`. Suffisant pour vérifier un rayon au mètre près à
 * l'échelle d'une ville, et surtout indépendant de l'implémentation testée.
 */
function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const mPerDegLat = 111_320;
  const dLat = (b.lat - a.lat) * mPerDegLat;
  const dLng =
    (b.lng - a.lng) * mPerDegLat * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

describe("circlePolygon", () => {
  it("ferme l'anneau exactement sur son premier point", () => {
    const ring = circlePolygon(TOURS, 1000).geometry.coordinates[0];
    assert.deepEqual(ring[0], ring[ring.length - 1]);
  });

  it("produit steps + 1 points, fermeture comprise", () => {
    const ring = circlePolygon(TOURS, 1000, 32).geometry.coordinates[0];
    assert.equal(ring.length, 33);
  });

  it("place tous ses points au rayon demandé", () => {
    const radiusM = 1500;
    const ring = circlePolygon(TOURS, radiusM).geometry.coordinates[0];

    for (const [lng, lat] of ring) {
      const d = metersBetween(TOURS, { lat, lng });
      // 1 % de tolérance : l'approximation plate et l'échantillonnage en 96
      // segments introduisent chacun un écart, tous deux sous le pixel à
      // l'écran.
      assert.ok(
        Math.abs(d - radiusM) < radiusM * 0.01,
        `point à ${d.toFixed(0)} m au lieu de ${radiusM} m`,
      );
    }
  });

  it("corrige l'aplatissement en longitude", () => {
    // Sans la correction par cos(lat), le cercle serait aussi large en degrés
    // qu'il est haut, donc visiblement ovale à la latitude de la France.
    const ring = circlePolygon(TOURS, 1000).geometry.coordinates[0];
    const lats = ring.map(([, lat]) => lat);
    const lngs = ring.map(([lng]) => lng);
    const spanLat = Math.max(...lats) - Math.min(...lats);
    const spanLng = Math.max(...lngs) - Math.min(...lngs);

    const expected = 1 / Math.cos((TOURS.lat * Math.PI) / 180);
    assert.ok(
      Math.abs(spanLng / spanLat - expected) < 0.01,
      `rapport ${(spanLng / spanLat).toFixed(3)} au lieu de ${expected.toFixed(3)}`,
    );
  });

  it("ne produit pas de NaN sur un rayon nul", () => {
    const ring = circlePolygon(TOURS, 0).geometry.coordinates[0];
    assert.ok(ring.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)));
  });

  it("ne produit pas de NaN au pôle, où cos(latitude) tend vers zéro", () => {
    const ring = circlePolygon({ lat: 90, lng: 0 }, 1000).geometry.coordinates[0];
    assert.ok(ring.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)));
  });
});

describe("circleBounds", () => {
  it("encadre exactement le polygone dessiné", () => {
    const ring = circlePolygon(TOURS, 800).geometry.coordinates[0];
    const [[west, south], [east, north]] = circleBounds(TOURS, 800);

    for (const [lng, lat] of ring) {
      // Tolérance d'un cheveu : les extrema du polygone échantillonné
      // touchent la boîte sans jamais la dépasser.
      assert.ok(lng >= west - 1e-9 && lng <= east + 1e-9);
      assert.ok(lat >= south - 1e-9 && lat <= north + 1e-9);
    }
  });
});

/** Style minimal reprenant les identifiants réels d'OpenFreeMap Positron. */
function fakeStyle(layerIds: string[]) {
  return {
    version: 8 as const,
    sources: {},
    layers: layerIds.map((id) => ({
      id,
      type: "line" as const,
      source: "openmaptiles",
      paint: { "line-color": "#000000", "line-width": 1 },
    })),
  };
}

describe("patchPositronStyle", () => {
  it("applique les overrides aux couches présentes", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patched = patchPositronStyle(fakeStyle(["highway_minor"]) as any);
    const layer = patched.layers.find((l) => l.id === "highway_minor");
    assert.equal(
      (layer as { paint: Record<string, unknown> }).paint["line-color"],
      "hsl(0,0%,82%)",
    );
  });

  it("conserve les propriétés de peinture non surchargées", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patched = patchPositronStyle(fakeStyle(["highway_major_casing"]) as any);
    const layer = patched.layers.find((l) => l.id === "highway_major_casing");
    assert.equal(
      (layer as { paint: Record<string, unknown> }).paint["line-width"],
      1,
    );
  });

  it("ignore une couche absente sans lever", () => {
    // Le cas qui compte : OpenFreeMap renomme une couche chez lui. On doit
    // perdre un réglage esthétique, pas la carte.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const style = fakeStyle(["une_couche_qui_nexiste_pas"]) as any;
    const patched = patchPositronStyle(style);
    assert.equal(patched.layers.length, 1);
    assert.equal(patched.layers[0].id, "une_couche_qui_nexiste_pas");
  });

  it("ne mute pas le style d'entrée", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const style = fakeStyle(["highway_minor"]) as any;
    patchPositronStyle(style);
    assert.equal(style.layers[0].paint["line-color"], "#000000");
  });

  it("laisse toutes les couches surchargées atteignables", () => {
    const patched = patchPositronStyle(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeStyle(OVERRIDDEN_LAYER_IDS) as any,
    );
    assert.equal(patched.layers.length, OVERRIDDEN_LAYER_IDS.length);
  });
});
