export type Theme = "dark" | "light";

const THEME_KEY = "caddieTheme";

export function getSavedTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const theme = window.localStorage.getItem(THEME_KEY);
  return theme === "dark" ? "dark" : "light";
}

export function saveTheme(theme: Theme): void {
  window.localStorage.setItem(THEME_KEY, theme);
}

export function applyTheme(theme: Theme): void {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}
