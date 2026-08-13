"use client";

import { MoonIcon, SunIcon } from "./icons";
import { applyTheme, useTheme } from "./use-theme";

/**
 * Bascule clair / sombre, dans le header.
 *
 * Par défaut on suit le système (aucune valeur stockée) ; le premier clic fige
 * un choix explicite, persisté et réappliqué avant peinture par le script du
 * layout. L'état vient de `useTheme`, partagé avec la carte.
 */
export function ThemeToggle() {
  const dark = useTheme() === "dark";

  return (
    <button
      type="button"
      onClick={() => applyTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Passer au thème clair" : "Passer au thème sombre"}
      title={
        dark
          ? "Thème sombre — cliquer pour le clair"
          : "Thème clair — cliquer pour le sombre"
      }
      className="flex h-9 w-9 items-center justify-center rounded-app border border-app-border bg-app-surface text-app-muted transition hover:bg-app-hover hover:text-app-text active:scale-[0.96]"
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
