/**
 * Defer interactive demo module graphs (and their CSS) until after first paint
 * / near viewport so article HTML wins the critical path.
 */

function ensureStylesheet(href) {
  if (!href || document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * @param {string} moduleUrl
 * @param {string} [mountSelector]
 * @param {string[]} [stylesheets]
 */
export function loadDemo(moduleUrl, mountSelector, stylesheets = []) {
  let started = false;
  const start = () => {
    if (started) {
      return;
    }
    started = true;
    for (const href of stylesheets) {
      ensureStylesheet(href);
    }
    import(moduleUrl).catch((error) => {
      console.error(`Failed to load demo ${moduleUrl}`, error);
      const mount = mountSelector ? document.querySelector(mountSelector) : null;
      const placeholder = mount?.querySelector("[data-demo-placeholder]");
      if (placeholder) {
        placeholder.textContent =
          "Interactive demo failed to load. The article below still explains the scheme.";
      }
    });
  };

  const mount = mountSelector ? document.querySelector(mountSelector) : null;
  if (mount && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { rootMargin: "280px" }
    );
    io.observe(mount);
  }

  const schedule =
    typeof window.requestIdleCallback === "function"
      ? (fn) => window.requestIdleCallback(fn, { timeout: 1800 })
      : (fn) => window.setTimeout(fn, 1);

  // Fallback if the mount never intersects (or observer is unavailable).
  schedule(start);
}
