/**
 * Appels JSON côté client, avec des messages d'erreur en français.
 *
 * Tous les fetch de l'interface passent par ici. Une coupure réseau, une API en
 * erreur ou une réponse illisible deviennent une `ApiError` au message
 * présentable — au lieu d'un rejet non géré qui fige l'écran en silence. Les
 * appelants n'ont plus qu'à `try/catch` et afficher `error.message`.
 */

/** Erreur réseau ou serveur, déjà traduite pour l'affichage. */
export class ApiError extends Error {
  /** Statut HTTP quand il y en a un ; absent pour une coupure ou un délai. */
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Au-delà, on considère le serveur injoignable plutôt que lent. */
const DEFAULT_TIMEOUT_MS = 20_000;

const OFFLINE_MESSAGE =
  "Connexion au serveur impossible. Vérifiez que l'application tourne, puis réessayez.";
const TIMEOUT_MESSAGE =
  "Le serveur met trop de temps à répondre. Réessayez dans un instant.";
const UNREADABLE_MESSAGE = "Réponse illisible du serveur.";

export type FetchJsonInit = RequestInit & {
  /** Délai maximal avant d'abandonner la requête (défaut : 20 s). */
  timeoutMs?: number;
};

/**
 * Émet une requête et renvoie son JSON, ou lève une `ApiError` lisible.
 *
 * `no-store` par défaut : l'interface veut toujours l'état courant, jamais une
 * réponse mise en cache par le navigateur.
 */
export async function fetchJson<T>(
  input: string,
  init: FetchJsonInit = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;

  // Un fetch qui ne répond jamais figerait la boucle de polling : on le borne.
  const timeout = AbortSignal.timeout(timeoutMs);
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(input, { cache: "no-store", ...rest, signal: composed });
  } catch (err) {
    // Annulation volontaire de l'appelant (démontage) : on laisse remonter.
    if (signal?.aborted) throw err;
    if (timeout.aborted) throw new ApiError(TIMEOUT_MESSAGE);
    throw new ApiError(OFFLINE_MESSAGE);
  }

  if (!res.ok) {
    throw new ApiError(await errorMessage(res), res.status);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(UNREADABLE_MESSAGE, res.status);
  }
}

/**
 * Message d'erreur le plus utile : celui renvoyé par l'API dans `{ error }`,
 * sinon un repli lisible déduit du statut HTTP.
 */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Corps vide ou non-JSON : on retombe sur le message par statut.
  }

  if (res.status === 404) return "Ressource introuvable.";
  if (res.status === 429) return "Trop de requêtes. Patientez un instant, puis réessayez.";
  if (res.status >= 500) return "Le serveur a rencontré une erreur. Réessayez dans un instant.";
  return `La requête a échoué (erreur ${res.status}).`;
}

/** Ramène n'importe quelle exception à un message affichable. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Une erreur inattendue s'est produite. Réessayez.";
}
