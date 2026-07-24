export type Theme = "dark" | "light";

const THEME_KEY = "caddieTheme";

export function getSavedTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const theme = window.localStorage.getItem(THEME_KEY);
  return theme === "light" ? "light" : "dark";
}

export function saveTheme(theme: Theme): void {
  window.localStorage.setItem(THEME_KEY, theme);
}

export function applyTheme(theme: Theme): void {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}
