/**
 * Tests de l'analyseur : aucun réseau, tout passe par les fixtures.
 * Le corpus couvre les quatre profils de sites qu'on rencontre en prospection.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

process.env.MOCK_EXTERNAL = "1";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opportunity-test-"));
process.env.OPPORTUNITY_DB_PATH = path.join(tmp, "test.db");

const { analyzeSite } = await import("../lib/analyzer/signals");
const { sniffCharset, resetFetchQueues } = await import("../lib/analyzer/fetch-site");
const { rankColors, toHex, isNeutral } = await import("../lib/analyzer/colors");

before(() => resetFetchQueues());
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("site moderne (latablemoderne.fr)", () => {
  it("ne présente aucun défaut majeur", async () => {
    const s = await analyzeSite("https://latablemoderne.fr/");

    assert.equal(s.reachable, true);
    assert.equal(s.https, true);
    assert.equal(s.hasViewport, true);
    assert.equal(s.hasTitle, true);
    assert.equal(s.hasMetaDesc, true);
    assert.equal(s.hasH1, true);
    assert.equal(s.hasRobots, true);
    assert.equal(s.hasSitemap, true);
    assert.equal(s.hasOgTags, true);
    assert.equal(s.hasFavicon, true);
    assert.equal(s.hasContactForm, true);
    assert.equal(s.hasAnalytics, true);
    assert.deepEqual(s.analyticsTools, ["Google Analytics 4"]);
    assert.equal(s.hasSocials, true);
    assert.deepEqual(s.outdatedTech, []);
    assert.equal(s.freeBuilder, null);
    assert.equal(s.copyrightYear, 2026);
  });

  it("suit les pages internes pertinentes et en extrait les titres", async () => {
    const s = await analyzeSite("https://latablemoderne.fr/");
    assert.ok(
      s.pagesFetched.some((u) => u.endsWith("/prestations")),
      `pages visitées : ${s.pagesFetched.join(", ")}`,
    );
    assert.ok(s.headings.includes("Privatisation de salle"));
    // « Accueil » et « Contact » doivent être filtrés de la navigation.
    assert.ok(!s.navLabels.some((l) => /^accueil$/i.test(l)));
    assert.ok(s.navLabels.includes("La carte"));
  });
});

describe("vieux WordPress en latin-1 (restaurant-ancien.fr)", () => {
  it("décode les accents malgré l'absence d'UTF-8", async () => {
    const s = await analyzeSite("http://www.restaurant-ancien.fr/");
    assert.equal(s.reachable, true);
    assert.match(s.title ?? "", /Restaurant à Zone demo/);
    assert.ok(
      s.headings.some((h) => h.includes("Galettes de blé noir")),
      `titres : ${s.headings.join(" | ")}`,
    );
  });

  it("détecte WordPress 4.9, jQuery 1.7, le layout en tableaux et Flash", async () => {
    const s = await analyzeSite("http://www.restaurant-ancien.fr/");
    assert.equal(s.cms, "WordPress");
    assert.equal(s.cmsVersion, "4.9.8");
    const techs = s.outdatedTech.join(" | ");
    assert.match(techs, /WordPress 4\.9\.8/);
    assert.match(techs, /jQuery 1\.7/);
    assert.match(techs, /tableaux/i);
    assert.match(techs, /Flash/);
  });

  it("relève l'absence de https, viewport, SEO, OG, analytics et réseaux", async () => {
    const s = await analyzeSite("http://www.restaurant-ancien.fr/");
    assert.equal(s.https, false);
    assert.equal(s.hasViewport, false);
    assert.equal(s.hasMetaDesc, false);
    assert.equal(s.hasH1, false);
    assert.equal(s.hasOgTags, false);
    assert.equal(s.hasFavicon, false);
    assert.equal(s.hasAnalytics, false);
    assert.equal(s.hasSocials, false);
    assert.equal(s.hasRobots, false);
    assert.equal(s.hasSitemap, false);
    assert.equal(s.copyrightYear, 2014);
  });
});

describe("builder gratuit", () => {
  it("reconnaît Wix", async () => {
    const s = await analyzeSite("https://www.plomberie-horizon.fr/");
    assert.equal(s.freeBuilder, "Wix");
    assert.equal(s.cms, "Wix");
    assert.equal(s.hasViewport, true);
    assert.equal(s.hasContactForm, false);
  });

  it("reconnaît e-monsite", async () => {
    const s = await analyzeSite("http://garage-atelier.e-monsite.com/");
    assert.equal(s.freeBuilder, "e-monsite");
    assert.equal(s.hasViewport, false);
    assert.equal(s.hasContactForm, true);
    assert.equal(s.copyrightYear, 2019);
  });

  it("traite une page Facebook comme un builder gratuit sans la fetcher", async () => {
    const s = await analyzeSite("https://www.facebook.com/plomberie.hervieu");
    assert.equal(s.freeBuilder, "Page Facebook");
    assert.equal(s.reachable, true);
    assert.equal(s.hasViewport, false);
  });
});

describe("site mort", () => {
  it("signale un domaine qui ne résout pas", async () => {
    const s = await analyzeSite("http://www.coiffure-eclat.fr/");
    assert.equal(s.reachable, false);
    assert.match(s.failureReason ?? "", /ENOTFOUND/);
    assert.deepEqual(s.pagesFetched, []);
  });

  it("refuse une URL inexploitable", async () => {
    const s = await analyzeSite("pas une url du tout ///");
    assert.equal(s.reachable, false);
  });
});

describe("détection du charset", () => {
  it("privilégie l'en-tête HTTP", () => {
    assert.equal(
      sniffCharset({ "content-type": "text/html; charset=iso-8859-1" }, Buffer.from("")),
      "windows-1252",
    );
  });

  it("retombe sur la balise meta", () => {
    const body = Buffer.from('<html><head><meta charset="UTF-8">');
    assert.equal(sniffCharset({}, body), "utf-8");
  });

  it("gère le vieux format http-equiv", () => {
    const body = Buffer.from(
      '<meta http-equiv="Content-Type" content="text/html; charset=windows-1252">',
    );
    assert.equal(sniffCharset({}, body), "windows-1252");
  });

  it("retombe sur utf-8 quand le charset annoncé est inconnu", () => {
    assert.equal(
      sniffCharset({ "content-type": "text/html; charset=inexistant-9" }, Buffer.from("")),
      "utf-8",
    );
  });
});

describe("extraction de couleurs", () => {
  it("normalise hex courts, rgb et noms de couleurs", () => {
    assert.equal(toHex("#F00"), "#ff0000");
    assert.equal(toHex("rgb(79, 70, 229)"), "#4f46e5");
    assert.equal(toHex("rgba(79,70,229,0.5)"), "#4f46e5");
    assert.equal(toHex("white"), "#ffffff");
    assert.equal(toHex("pas-une-couleur"), null);
  });

  it("écarte blanc, noir et gris", () => {
    assert.equal(isNeutral("#ffffff"), true);
    assert.equal(isNeutral("#000000"), true);
    assert.equal(isNeutral("#808080"), true);
    assert.equal(isNeutral("#4f46e5"), false);
  });

  it("classe par fréquence et plafonne à 4", () => {
    const ranked = rankColors([
      "#4f46e5",
      "#4f46e5",
      "#4f46e5",
      "#dc2626",
      "#dc2626",
      "#16a34a",
      "#ca8a04",
      "#0891b2",
      "#ffffff",
      "#000000",
    ]);
    assert.equal(ranked.length, 4);
    assert.deepEqual(ranked[0], { hex: "#4f46e5", count: 3 });
    assert.deepEqual(ranked[1], { hex: "#dc2626", count: 2 });
    assert.ok(!ranked.some((c) => c.hex === "#ffffff"));
  });

  it("récupère la palette d'un site réel du corpus", async () => {
    const { extractColors } = await import("../lib/analyzer/colors");
    const s = await analyzeSite("http://ln-coiffure.fr/");
    const palette = await extractColors(s);
    // #fdf2f8 (fond rose très pâle) est écarté : trop désaturé pour
    // caractériser une charte.
    assert.deepEqual(palette.map((c) => c.hex).sort(), ["#7c3aed", "#be185d"].sort());
  });
});
