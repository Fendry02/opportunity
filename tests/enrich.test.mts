/**
 * Tests des heuristiques d'enrichissement — pures, sans réseau.
 * Les cas viennent de ce que renvoie réellement l'API gouv (codes seuls) et de
 * la forme des mentions légales françaises.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nameSimilarity, normalizeName } from "../lib/enrich/gouv";
import { detectOptOut, optOutLabel } from "../lib/opt-out";
import { nafLabel, natureJuridiqueLabel } from "../lib/enrich/insee-labels";
import { parseLegalNotice } from "../lib/enrich/mentions-legales";
import { deduceServices } from "../lib/enrich/services";
import { buildBrief } from "../lib/brief";
import type { ProspectDetail } from "../lib/types";

describe("rapprochement de noms d'entreprise", () => {
  it("ignore la forme juridique et les accents", () => {
    assert.equal(normalizeName("SARL Réno' Bâtiment"), "reno batiment");
    assert.equal(normalizeName("ETS MARTIN & FILS"), "martin fils");
  });

  it("rapproche le nom Google du nom au registre", () => {
    assert.ok(nameSimilarity("Restaurant Ancien", "SARL RESTAURANT ANCIEN") >= 0.5);
    assert.ok(nameSimilarity("Garage Atelier", "GARAGE ATELIER") === 1);
  });

  it("écarte les homonymes sans rapport", () => {
    assert.ok(nameSimilarity("Coiffure Éclat", "BOULANGERIE DUPONT") < 0.5);
  });
});

describe("refus de démarchage", () => {
  it("repère le faux domaine rencontré en conditions réelles", () => {
    const optOut = detectOptOut({
      name: "Grange et Fils, Philippe & Valentin",
      websiteUrl: "http://pasdedémarchagepourunsite.com/",
    });
    assert.deepEqual(optOut, { marker: "pas de démarchage", source: "site" });
    assert.match(optOutLabel(optOut!), /à la place du site/);
  });

  it("repère la mention portée par le nom de l'établissement", () => {
    const optOut = detectOptOut({ name: "Plomberie Martin — NE PAS DÉMARCHER" });
    assert.equal(optOut?.source, "nom");
    assert.match(optOutLabel(optOut!), /dans le nom de la fiche/);
  });

  it("traverse accents, tirets et casse", () => {
    for (const url of [
      "https://pas-de-demarchage.fr",
      "https://PasDeDémarchage.com",
      "https://www.stop-pub-merci.fr",
    ]) {
      assert.ok(detectOptOut({ name: "Test", websiteUrl: url }), url);
    }
  });

  it("ne se déclenche pas sur des entreprises ordinaires", () => {
    for (const [name, url] of [
      ["Plomberie Atlas", "https://plomberie-atlas.fr"],
      ["Au Bon Pain", "https://aubonpain.fr"],
      ["Garage Atelier", "http://garage-atelier.e-monsite.com/"],
      ["Pub Demo", "https://pub-demo.fr"],
    ]) {
      assert.equal(detectOptOut({ name, websiteUrl: url }), null, name);
    }
  });

  it("privilégie le nom, disponible avant l'appel facturé", () => {
    const optOut = detectOptOut({
      name: "Stop démarchage SARL",
      websiteUrl: "http://pasdedemarchage.com",
    });
    assert.equal(optOut?.source, "nom");
  });
});

describe("mentions légales", () => {
  it("relève le dirigeant et le SIRET", () => {
    const parsed = parseLegalNotice(
      `<p>Éditeur : SARL RESTAURANT ANCIEN</p>
       <p>Gérant : Yann Le Gall</p>
       <p>SIRET : 000 000 001 00001</p>`,
    );
    assert.equal(parsed.dirigeantName, "Yann Le Gall");
    assert.equal(parsed.dirigeantRole, "Gérant");
    assert.equal(parsed.siret, "00000000100001");
    assert.equal(parsed.siren, "000000001");
  });

  it("gère « Directeur de la publication » et la civilité", () => {
    const parsed = parseLegalNotice(
      "<div>Directeur de la publication : M. Pascal Lemoine</div>",
    );
    assert.equal(parsed.dirigeantName, "Pascal Lemoine");
  });

  it("ne renvoie rien quand la page ne dit rien", () => {
    const parsed = parseLegalNotice("<p>Bienvenue sur notre site.</p>");
    assert.equal(parsed.dirigeantName, null);
    assert.equal(parsed.siret, null);
  });
});

describe("libellés INSEE", () => {
  it("traduit les catégories juridiques courantes", () => {
    assert.equal(natureJuridiqueLabel("5499"), "SARL");
    assert.equal(natureJuridiqueLabel("5710"), "SAS");
    assert.equal(natureJuridiqueLabel("1000"), "Entrepreneur individuel");
  });

  it("retombe sur la famille en gardant le code", () => {
    assert.equal(natureJuridiqueLabel("5385"), "Société commerciale (5385)");
    assert.equal(natureJuridiqueLabel(null), null);
  });

  it("traduit les codes NAF des secteurs ciblés", () => {
    assert.equal(
      nafLabel("96.02A"),
      "Coiffure",
    );
    assert.equal(
      nafLabel("43.22A"),
      "Travaux d'installation d'eau et de gaz en tous locaux",
    );
  });

  it("retombe sur la section pour un code inconnu", () => {
    assert.equal(nafLabel("62.01Z", "J"), "Information et communication");
    assert.equal(nafLabel("62.01Z"), null);
  });
});

describe("déduction des prestations", () => {
  it("retient les intitulés métier et écarte le bruit", () => {
    const services = deduceServices({
      navLabels: ["Accueil", "Nos services", "Contact", "Mentions légales"],
      headings: [
        "Dépannage d'urgence",
        "Recherche de fuite",
        "Rénovation de salle de bain",
        "Suivez-nous sur Facebook",
        "Nos actualités",
      ],
      sectorId: "plombier",
      primaryType: "plumber",
    });
    assert.ok(services.includes("Recherche de fuite"));
    assert.ok(services.includes("Rénovation de salle de bain"));
    assert.ok(!services.some((s) => /actualit|suivez/i.test(s)));
    assert.ok(services.length <= 8);
  });

  it("ne renvoie rien quand il n'y a que du bruit", () => {
    assert.deepEqual(
      deduceServices({
        navLabels: ["Accueil", "Contact"],
        headings: ["Nos actualités"],
        sectorId: "coiffeur",
        primaryType: "hair_salon",
      }),
      [],
    );
  });
});

describe("brief markdown", () => {
  const base: ProspectDetail = {
    id: "x",
    name: "Plomberie Atlas",
    sector: "plombier",
    sectorLabel: "Plombier",
    googleTypes: [],
    primaryType: "plumber",
    lat: 47.3899,
    lng: 0.691,
    address: "21 rue Marceau, 37000 Tours, France",
    phone: "01 00 00 00 00",
    websiteUrl: null,
    rating: 4.6,
    reviewCount: 38,
    openingHours: [],
    businessStatus: "OPERATIONAL",
    detailsFetchedAt: null,
    score: 92,
    tier: "high",
    optOut: null,
    contactStatus: "to_contact",
    breakdown: [
      {
        key: "base.noSite",
        label: "Aucun site web",
        points: 80,
        note: "Aucun site web renseigné sur la fiche Google.",
      },
      {
        key: "bonus.reviews20",
        label: "Visibilité Google",
        points: 5,
        note: "38 avis Google.",
      },
    ],
    analysis: null,
    enrichment: null,
    searches: [],
  };

  it("contient toutes les sections attendues", () => {
    const md = buildBrief(base);
    for (const heading of [
      "# Plomberie Atlas",
      "## Identité",
      "## Interlocuteur",
      "## Diagnostic",
      "## Recommandations",
    ]) {
      assert.ok(md.includes(heading), `section manquante : ${heading}`);
    }
    assert.match(md, /\*\*Score d'opportunité : 92\/100\*\* — Prioritaire/);
    assert.match(md, /\*\*Total : 92\/100\*\*/);
  });

  it("personnalise la recommandation avec le métier et la ville", () => {
    const md = buildBrief(base);
    assert.match(md, /« plombier \+ Tours »/);
  });

  it("n'émet que les recommandations correspondant aux défauts détectés", () => {
    const md = buildBrief(base);
    assert.ok(!md.includes("certificat TLS"), "HTTPS n'est pas un défaut ici");
    assert.ok(!md.includes("Open Graph"));
  });

  it("échappe les pipes pour ne pas casser le tableau", () => {
    const md = buildBrief({
      ...base,
      breakdown: [
        {
          key: "defect.outdatedTech",
          label: "Technologie obsolète",
          points: 10,
          note: "Détecté : jQuery 1.7 | table layout",
        },
      ],
    });
    assert.match(md, /jQuery 1\.7 \\\| table layout/);
  });
});
