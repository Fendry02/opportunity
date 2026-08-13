"use client";

import { useSyncExternalStore } from "react";

/**
 * Thème résolu (clair / sombre), lu comme un état extérieur à React :
 * préférence système + choix stocké. Partagé par la bascule et la carte, qui
 * doivent réagir au même changement, sans écart d'hydratation.
 */

export type Theme = "light" | "dark";

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

/** Côté serveur, on ne connaît pas le thème : clair par défaut. */
function serverTheme(): Theme {
  return "light";
}

/** Applique un choix explicite, le persiste, et prévient les abonnés. */
export function applyTheme(next: Theme): void {
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.dataset.theme = next;
  // `storage` ne se déclenche pas dans l'onglet courant : on notifie à la main.
  listeners.forEach((listener) => listener());
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, serverTheme);
}
