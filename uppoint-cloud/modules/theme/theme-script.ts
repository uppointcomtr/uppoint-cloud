import { defaultTheme, themeStorageKey } from "@/modules/theme/config";

export const themeInitScript = `(() => {
  try {
    const root = document.documentElement;
    const savedTheme = localStorage.getItem("${themeStorageKey}");
    const resolvedTheme = savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : "${defaultTheme}";

    root.classList.toggle("dark", resolvedTheme === "dark");
    root.dataset.theme = resolvedTheme;
  } catch {
    document.documentElement.classList.remove("dark");
    document.documentElement.dataset.theme = "${defaultTheme}";
  }
})();`;
