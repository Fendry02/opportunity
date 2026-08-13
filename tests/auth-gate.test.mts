import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSessionToken,
  passwordMatches,
  verifySessionToken,
} from "../lib/auth-gate";

/** `now` est injecté : les tests restent déterministes, sans horloge réelle. */
const SECRET = "hunter2";
const NOW = 1_700_000_000_000;

describe("barrière mot de passe", () => {
  it("accepte un jeton frais", async () => {
    const token = await createSessionToken(SECRET, NOW);
    assert.equal(await verifySessionToken(token, SECRET, NOW), true);
  });

  it("refuse un mauvais secret", async () => {
    const token = await createSessionToken(SECRET, NOW);
    assert.equal(await verifySessionToken(token, "autre-mot-de-passe", NOW), false);
  });

  it("refuse un jeton expiré", async () => {
    const token = await createSessionToken(SECRET, NOW, 1000);
    assert.equal(await verifySessionToken(token, SECRET, NOW + 2000), false);
  });

  it("refuse un jeton falsifié", async () => {
    const token = await createSessionToken(SECRET, NOW);
    const tampered = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    assert.equal(await verifySessionToken(tampered, SECRET, NOW), false);
  });

  it("refuse un jeton absent ou mal formé", async () => {
    assert.equal(await verifySessionToken(undefined, SECRET, NOW), false);
    assert.equal(await verifySessionToken("sans-point", SECRET, NOW), false);
  });

  it("valide le bon mot de passe et rejette les autres", async () => {
    assert.equal(await passwordMatches("hunter2", "hunter2"), true);
    assert.equal(await passwordMatches("hunter3", "hunter2"), false);
    assert.equal(await passwordMatches("", "hunter2"), false);
  });
});
