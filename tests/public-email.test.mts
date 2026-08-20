import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractPublicEmail } from "../lib/enrich/public-email";

describe("e-mail public", () => {
  it("privilégie l'adresse de contact explicitement publiée", () => {
    const email = extractPublicEmail(`
      <footer><a href="mailto:contact@atelier-rivoli.fr">Nous écrire</a></footer>
      <p>Claire Martin : claire@atelier-rivoli.fr</p>
    `);

    assert.equal(email, "contact@atelier-rivoli.fr");
  });

  it("lit une adresse visible et ignore les exemples sans valeur commerciale", () => {
    assert.equal(
      extractPublicEmail("<p>Écrivez à bonjour@plomberie-atlas.fr</p>"),
      "bonjour@plomberie-atlas.fr",
    );
    assert.equal(extractPublicEmail("<p>test@example.com</p>"), null);
  });
});
