/**
 * Barrière mot de passe de l'instance auto-hébergée.
 *
 * Signe et vérifie un cookie de session avec Web Crypto (HMAC-SHA256), donc le
 * même code sert au middleware (runtime Edge) et aux routes (runtime Node). La
 * clé de signature est le mot de passe lui-même : un seul secret à définir pour
 * protéger une instance.
 *
 * Le cookie ne contient qu'« expiration.signature » : rien de sensible, et
 * infalsifiable sans connaître `APP_PASSWORD`.
 */

export const SESSION_COOKIE = "opp_session";

/** Durée de vie d'une session : 30 jours. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return toHex(signature);
}

/** Comparaison à temps constant de deux chaînes de même longueur. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Valeur de cookie pour une session qui expire dans `ttlMs`. */
export async function createSessionToken(
  secret: string,
  now: number,
  ttlMs: number = SESSION_TTL_MS,
): Promise<string> {
  const expiresAt = now + ttlMs;
  return `${expiresAt}.${await sign(String(expiresAt), secret)}`;
}

/** Vrai si le cookie est authentique et non expiré. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now: number,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;

  const expiresAt = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expiresMs = Number(expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs < now) return false;

  return safeEqual(signature, await sign(expiresAt, secret));
}

/**
 * Compare le mot de passe fourni à celui attendu, sans fuite de temps ni de
 * longueur : on compare des condensés de taille fixe, calculés avec le mot de
 * passe attendu comme clé.
 */
export async function passwordMatches(
  provided: string,
  expected: string,
): Promise<boolean> {
  const [a, b] = await Promise.all([
    sign(provided, expected),
    sign(expected, expected),
  ]);
  return safeEqual(a, b);
}
