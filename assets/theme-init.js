/**
 * Apply theme before paint to avoid a flash.
 * Preference: localStorage "site-theme" = "light" | "dark" | "system" (default).
 */
(function () {
  const STORAGE_KEY = "site-theme";

  function systemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function resolveTheme(preference) {
    if (preference === "light" || preference === "dark") {
      return preference;
    }
    return systemTheme();
  }

  function applyTheme(preference) {
    const resolved = resolveTheme(preference);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference || "system";
    document.documentElement.style.colorScheme = resolved;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  const preference =
    stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
  applyTheme(preference);

  window.__siteTheme = {
    STORAGE_KEY,
    systemTheme,
    resolveTheme,
    applyTheme,
    getPreference() {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" || value === "system"
        ? value
        : "system";
    },
    setPreference(preference) {
      const next =
        preference === "light" || preference === "dark" || preference === "system"
          ? preference
          : "system";
      if (next === "system") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
      applyTheme(next);
      window.dispatchEvent(
        new CustomEvent("site-theme-change", { detail: { preference: next } })
      );
    },
  };
})();
