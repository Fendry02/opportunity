import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SiteSignals } from "../lib/analyzer/signals";
import {
  MAX_BONUS,
  MAX_DEFECTS,
  NO_SITE_BASE,
  computeScore,
  scoreTier,
} from "../lib/scoring";

/** Site sans le moindre défaut : sert de témoin bas. */
function perfectSite(over: Partial<SiteSignals> = {}): SiteSignals {
  return {
    url: "https://exemple.fr/",
    finalUrl: "https://exemple.fr/",
    reachable: true,
    failureReason: null,
    https: true,
    hasViewport: true,
    hasTitle: true,
    hasMetaDesc: true,
    hasH1: true,
    hasSitemap: true,
    hasRobots: true,
    hasContactForm: true,
    hasOgTags: true,
    hasFavicon: true,
    hasAnalytics: true,
    hasSocials: true,
    cms: null,
    cmsVersion: null,
    outdatedTech: [],
    freeBuilder: null,
    copyrightYear: 2026,
    pageWeightKb: 320,
    fetchMs: 400,
    title: "Exemple",
    metaDescription: "Une description suffisamment longue pour compter.",
    analyticsTools: ["Plausible"],
    socials: ["https://instagram.com/exemple"],
    navLabels: [],
    headings: [],
    pagesFetched: ["https://exemple.fr/"],
    cssUrls: [],
    inlineColors: [],
    ...over,
  };
}

/** Site cumulant tous les défauts du barème. */
function worstSite(): SiteSignals {
  return perfectSite({
    https: false,
    hasViewport: false,
    hasTitle: false,
    hasMetaDesc: false,
    hasH1: false,
    hasSitemap: false,
    hasRobots: false,
    hasContactForm: false,
    hasOgTags: false,
    hasFavicon: false,
    hasAnalytics: false,
    hasSocials: false,
    outdatedTech: ["jQuery 1.7.2", "Mise en page en tableaux HTML"],
    freeBuilder: "Wix",
    copyrightYear: 2014,
    pageWeightKb: 4096,
    fetchMs: 8000,
  });
}

const totalOf = (breakdown: { points: number }[]) =>
  breakdown.reduce((n, l) => n + l.points, 0);

describe("absence de site", () => {
  it("part de 80 sans aucun bonus", () => {
    const score = computeScore({ signals: null });
    assert.equal(score.total, NO_SITE_BASE);
    assert.equal(score.breakdown[0].key, "base.noSite");
  });

  it("dépasse 80 avec les bonus d'attractivité", () => {
    const score = computeScore({
      signals: null,
      rating: 4.6,
      reviewCount: 38,
      phone: "01 00 00 00 00",
    });
    assert.ok(score.total >= 80, `attendu >= 80, obtenu ${score.total}`);
    assert.equal(score.total, 92); // 80 + 5 (>=20 avis) + 4 (note) + 3 (tél.)
  });

  it("plafonne à 100", () => {
    const score = computeScore({
      signals: null,
      rating: 4.9,
      reviewCount: 800,
      phone: "01 00 00 00 00",
    });
    assert.equal(score.total, 95); // 80 + 15 de bonus, plafond de bonus atteint
    assert.ok(score.total <= 100);
  });

  it("traite un site injoignable comme une absence de site", () => {
    const dead = perfectSite({ reachable: false, failureReason: "ENOTFOUND" });
    const score = computeScore({ signals: dead });
    assert.equal(score.total, NO_SITE_BASE);
    assert.equal(score.breakdown[0].label, "Site injoignable");
    assert.match(score.breakdown[0].note, /ENOTFOUND/);
  });
});

describe("site existant", () => {
  it("note un site parfait sous 20", () => {
    const score = computeScore({ signals: perfectSite(), currentYear: 2026 });
    assert.equal(score.total, 0);
    assert.ok(score.total < 20);
    assert.deepEqual(score.breakdown, []);
  });

  it("garde un site parfait sous 20 même avec tous les bonus", () => {
    const score = computeScore({
      signals: perfectSite(),
      rating: 4.9,
      reviewCount: 900,
      phone: "01 00 00 00 00",
      currentYear: 2026,
    });
    assert.equal(score.total, MAX_BONUS);
    assert.ok(score.total < 20);
  });

  it("atteint le plafond de défauts sur un site qui les cumule tous", () => {
    const score = computeScore({ signals: worstSite(), currentYear: 2026 });
    assert.equal(score.total, MAX_DEFECTS);
  });

  it("ne dépasse jamais 100", () => {
    const score = computeScore({
      signals: worstSite(),
      rating: 4.8,
      reviewCount: 500,
      phone: "01 00 00 00 00",
      currentYear: 2026,
    });
    assert.equal(score.total, 100);
  });
});

describe("cohérence du détail", () => {
  it("la somme du détail vaut toujours le total", () => {
    const cases = [
      computeScore({ signals: null, reviewCount: 25, rating: 4.2, phone: "01" }),
      computeScore({ signals: perfectSite(), currentYear: 2026 }),
      computeScore({ signals: worstSite(), currentYear: 2026, reviewCount: 60 }),
      computeScore({
        signals: perfectSite({ https: false, hasViewport: false }),
        currentYear: 2026,
      }),
    ];
    for (const score of cases) {
      assert.equal(
        totalOf(score.breakdown),
        score.total,
        `détail=${totalOf(score.breakdown)} total=${score.total}`,
      );
    }
  });

  it("chaque ligne porte une clé, un libellé et une note exploitables", () => {
    const { breakdown } = computeScore({
      signals: worstSite(),
      currentYear: 2026,
      phone: "01 00 00 00 00",
    });
    for (const line of breakdown) {
      assert.match(line.key, /^(defect|bonus|base)\./);
      assert.ok(line.label.length > 3, line.key);
      assert.ok(line.note.length > 15, `note trop courte pour ${line.key}`);
      assert.ok(line.points > 0, line.key);
    }
  });
});

describe("détail du référencement", () => {
  it("cumule les sous-critères SEO manquants", () => {
    const score = computeScore({
      signals: perfectSite({ hasTitle: false, hasSitemap: false }),
      currentYear: 2026,
    });
    const seo = score.breakdown.find((l) => l.key === "defect.seo");
    assert.ok(seo);
    assert.equal(seo.points, 4); // title 2 + sitemap 2
    assert.match(seo.note, /balise title/);
    assert.match(seo.note, /sitemap\.xml/);
  });

  it("n'ajoute aucune ligne SEO quand tout est en place", () => {
    const score = computeScore({ signals: perfectSite(), currentYear: 2026 });
    assert.equal(
      score.breakdown.find((l) => l.key === "defect.seo"),
      undefined,
    );
  });
});

describe("copyright dépassé", () => {
  it("se déclenche à 3 ans de retard, pas à 2", () => {
    const twoYears = computeScore({
      signals: perfectSite({ copyrightYear: 2024 }),
      currentYear: 2026,
    });
    assert.equal(twoYears.total, 0);

    const threeYears = computeScore({
      signals: perfectSite({ copyrightYear: 2023 }),
      currentYear: 2026,
    });
    assert.equal(threeYears.total, 7);
    assert.match(
      threeYears.breakdown[0].note,
      /2023.*3 ans/,
      threeYears.breakdown[0].note,
    );
  });
});

describe("paliers d'affichage", () => {
  it("correspond aux couleurs de pins", () => {
    assert.equal(scoreTier(100), "high");
    assert.equal(scoreTier(70), "high");
    assert.equal(scoreTier(69), "mid");
    assert.equal(scoreTier(45), "mid");
    assert.equal(scoreTier(44), "low");
    assert.equal(scoreTier(25), "low");
    assert.equal(scoreTier(24), "none");
    assert.equal(scoreTier(0), "none");
  });
});
