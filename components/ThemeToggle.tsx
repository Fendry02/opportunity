"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons";

/**
 * Bascule clair / sombre, dans le header.
 *
 * Par défaut on suit le système (aucune valeur stockée) ; le premier clic fige
 * un choix explicite, persisté et réappliqué avant peinture par le script du
 * layout. Le thème est lu via `useSyncExternalStore` : c'est un état extérieur
 * à React (localStorage + préférence système), et le store réagit au changement
 * de thème système comme aux autres onglets, sans écart d'hydratation.
 */

type Theme = "light" | "dark";
const STORAGE_KEY = "opportunity:theme";
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    media.removeEventListener("change", callback);
    window.removeEventListener("storage", callback);
  };
}

function readTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Côté serveur, on ne connaît pas le thème : on rend le clair par défaut. */
function serverTheme(): Theme {
  return "light";
}

function applyTheme(next: Theme): void {
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.dataset.theme = next;
  // Le `storage` event ne se déclenche pas dans l'onglet courant : on notifie.
  listeners.forEach((listener) => listener());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);
  const dark = theme === "dark";

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
