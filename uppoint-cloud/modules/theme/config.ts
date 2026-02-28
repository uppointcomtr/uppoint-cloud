export const themes = ["light", "dark"] as const;

export type Theme = (typeof themes)[number];

export const defaultTheme: Theme = "dark";
export const themeStorageKey = "uppoint-theme";

export function isTheme(value: string): value is Theme {
  return themes.includes(value as Theme);
}
