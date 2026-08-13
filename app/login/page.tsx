import type { Metadata } from "next";

export const metadata: Metadata = { title: "Connexion" };

/**
 * Page de connexion minimale : un simple formulaire POST, sans JavaScript. Ne
 * s'affiche que sur une instance protégée par `APP_PASSWORD`.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <form
        method="post"
        action="/api/login"
        className="w-full max-w-xs rounded-app border border-app-border bg-app-surface p-6"
      >
        <h1 className="text-[15px] font-semibold tracking-tight">Opportunity</h1>
        <p className="mt-1 text-[12.5px] text-app-muted">
          Cette instance est protégée. Entrez le mot de passe pour continuer.
        </p>

        <input
          type="password"
          name="password"
          autoFocus
          required
          aria-label="Mot de passe"
          className="mt-4 h-9 w-full rounded-app border border-app-border bg-app-surface px-3 text-sm"
        />

        {error && (
          <p className="mt-2 text-[12.5px] text-app-ko">Mot de passe incorrect.</p>
        )}

        <button
          type="submit"
          className="mt-4 h-9 w-full rounded-app bg-app-accent text-sm font-medium text-white transition hover:bg-app-accent-hover active:scale-[0.98]"
        >
          Se connecter
        </button>
      </form>
    </main>
  );
}
