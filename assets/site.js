const SITE_CONFIG = {
  title: "Technology and Security",
  shortTitle: "Arash Afshar",
  subtitle: "Software Engineer, Information Security researcher, and hobbyist photographer",
  description:
    "A blog in which I keep track of my explorations in technology and security and share them.",
  eyebrow: "Notes on security, systems, and practical engineering",
  socialLinks: [
    { label: "GitHub", href: "https://github.com/Arash-Afshar" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/arash-afshar/" },
    { label: "Twitter", href: "https://twitter.com/_aafshar_" },
    { label: "Stack Overflow", href: "https://stackoverflow.com/users/1413326/arash" },
  ],
  nav: [
    { label: "Home", href: "/" },
    { label: "Blogs", href: "/blog/" },
    { label: "About", href: "/about/" },
  ],
};

function byId(id) {
  return document.getElementById(id);
}

function installCloudflareAnalytics() {
  if (document.querySelector('script[data-cf-beacon]')) {
    return;
  }

  const beacon = document.createElement("script");
  beacon.type = "module";
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.dataset.cfBeacon = JSON.stringify({
    token: "ebb64acd47c744a78a1aa3500af254cc",
  });
  document.head.appendChild(beacon);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function themeToggleLabel(resolved) {
  return resolved === "dark" ? "Switch to light theme" : "Switch to dark theme";
}

function syncThemeToggle(button) {
  if (!button || !window.__siteTheme) {
    return;
  }
  const preference = window.__siteTheme.getPreference();
  const resolved = window.__siteTheme.resolveTheme(preference);
  button.dataset.theme = resolved;
  button.setAttribute("aria-label", themeToggleLabel(resolved));
  button.title =
    preference === "system"
      ? `Theme: system (${resolved}). Click to set ${resolved === "dark" ? "light" : "dark"}.`
      : `Theme: ${resolved}. Click to switch. Double-click for system.`;
}

function installThemeToggle(button) {
  if (!button || !window.__siteTheme) {
    return;
  }

  syncThemeToggle(button);

  button.addEventListener("click", () => {
    const preference = window.__siteTheme.getPreference();
    const resolved = window.__siteTheme.resolveTheme(preference);
    window.__siteTheme.setPreference(resolved === "dark" ? "light" : "dark");
    syncThemeToggle(button);
  });

  button.addEventListener("dblclick", (event) => {
    event.preventDefault();
    window.__siteTheme.setPreference("system");
    syncThemeToggle(button);
  });

  if (window.matchMedia) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (window.__siteTheme.getPreference() === "system") {
        window.__siteTheme.applyTheme("system");
        syncThemeToggle(button);
      }
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
    } else if (typeof media.addListener === "function") {
      media.addListener(onChange);
    }
  }

  window.addEventListener("site-theme-change", () => syncThemeToggle(button));
}

function syncNavCurrent(header) {
  const currentPath = window.location.pathname;
  header.querySelectorAll(".site-nav a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const isCurrent =
      currentPath === href || (href !== "/" && currentPath.startsWith(href));
    if (isCurrent) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function buildHeader() {
  const header = byId("site-header");
  if (!header) {
    return;
  }

  // Keep prerendered chrome to avoid header swap CLS; just wire behavior.
  if (header.dataset.prerendered === "true" && byId("theme-toggle")) {
    syncNavCurrent(header);
    installThemeToggle(byId("theme-toggle"));
    return;
  }

  const currentPath = window.location.pathname;
  const navLinks = SITE_CONFIG.nav
    .map((item) => {
      const isCurrent =
        currentPath === item.href ||
        (item.href !== "/" && currentPath.startsWith(item.href));
      const currentAttr = isCurrent ? ' aria-current="page"' : "";
      return `<a href="${item.href}"${currentAttr}>${item.label}</a>`;
    })
    .join("");

  header.innerHTML = `
    <a class="brand" href="/">
      <span class="brand-copy">
        <span class="brand-title">${SITE_CONFIG.title}</span>
        <span class="brand-subtitle">${SITE_CONFIG.shortTitle}</span>
      </span>
    </a>
    <div class="header-controls">
      <nav class="site-nav" aria-label="Primary">
        ${navLinks}
      </nav>
      <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch theme">
        <span class="theme-toggle-track" aria-hidden="true"></span>
        <span class="theme-toggle-icon theme-toggle-icon--sun" aria-hidden="true">
          <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.4"/><path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"/></svg>
        </span>
        <span class="theme-toggle-icon theme-toggle-icon--moon" aria-hidden="true">
          <svg viewBox="0 0 16 16"><path fill="currentColor" stroke="none" d="M10.2 2.2a5.5 5.5 0 1 0 3.6 9.4A4.4 4.4 0 1 1 10.2 2.2z"/></svg>
        </span>
        <span class="theme-toggle-thumb" aria-hidden="true"></span>
      </button>
    </div>
  `;

  installThemeToggle(byId("theme-toggle"));
}

function buildFooter() {
  const footer = byId("site-footer");
  if (!footer) {
    return;
  }

  if (footer.dataset.prerendered === "true" && footer.childNodes.length) {
    return;
  }

  footer.innerHTML = `
    <p>&copy; ${new Date().getFullYear()} ${SITE_CONFIG.title}. Hosted on GitHub Pages.</p>
  `;
}

async function loadContentIndex() {
  const response = await fetch("/content/content-index.json");
  if (!response.ok) {
    throw new Error("Failed to load content index.");
  }
  return response.json();
}

async function loadMarkdown(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load markdown from ${path}.`);
  }
  return response.text();
}

function isPrerendered(element) {
  return Boolean(element?.dataset?.prerendered === "true");
}

async function ensureMarkdownRenderer() {
  if (window.MarkdownRenderer?.render) {
    return window.MarkdownRenderer;
  }

  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="/assets/markdown.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("markdown.js failed")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "/assets/markdown.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load markdown.js"));
    document.head.appendChild(script);
  });

  if (!window.MarkdownRenderer?.render) {
    throw new Error("Markdown renderer is unavailable.");
  }
  return window.MarkdownRenderer;
}

function setDocumentMeta({ title, description }) {
  document.title = title ? `${title} | ${SITE_CONFIG.title}` : SITE_CONFIG.title;
  const descriptionTag = document.querySelector('meta[name="description"]');
  if (descriptionTag && description) {
    descriptionTag.setAttribute("content", description);
  }
}

function postSummary(post) {
  if (post.summary) {
    return post.summary;
  }

  return "";
}

function buildHero() {
  const hero = byId("hero");
  if (!hero) {
    return;
  }

  hero.innerHTML = `<p class="hero-eyebrow">Field notes / ${new Date().getFullYear()}</p><p class="blog-lede">Ideas, experiments, and notes on security, systems, and practical engineering.</p><a class="blog-home-link" href="/">← Back to the profile</a>`;
}

function renderHome() {
  setDocumentMeta({ title: "Home", description: SITE_CONFIG.description });
}

function renderPostList(posts) {
  const target = byId("post-list");
  if (!target) {
    return;
  }

  if (isPrerendered(target) && target.children.length) {
    return;
  }

  if (!posts.length) {
    target.innerHTML = '<p class="empty-state">No posts are available yet.</p>';
    return;
  }

  target.innerHTML = posts
    .map((post) => {
      const tags = (post.tags || []).map((tag) => `<span class="pill">${tag}</span>`).join("");
      return `
        <a class="post-card" href="${post.url}">
          <h2>${post.title}</h2>
          <p>${postSummary(post)}</p>
          <div class="post-meta">
            <span>${formatDate(post.date)}</span>
          </div>
          <div class="post-tags">${tags}</div>
        </a>
      `;
    })
    .join("");
}

async function renderBlogIndex(indexData) {
  setDocumentMeta({
    title: "Blog",
    description: SITE_CONFIG.description,
  });

  const list = byId("post-list");
  if (isPrerendered(list) && list.children.length) {
    return;
  }

  const posts = indexData.posts
    .slice()
    .sort((left, right) => new Date(right.date) - new Date(left.date));

  renderPostList(posts);
}

async function renderMarkdownPage(entry) {
  const articleTitle = byId("article-title");
  const articleDescription = byId("article-description");
  const articleMeta = byId("article-meta");
  const articleBody = byId("article-body");

  if (!articleBody) {
    return;
  }

  // Static HTML already contains the article for crawlers and first paint.
  if (isPrerendered(articleBody) && articleBody.childNodes.length) {
    setDocumentMeta({
      title: entry.title,
      description: entry.description || SITE_CONFIG.description,
    });
    return;
  }

  const markdown = await loadMarkdown(entry.contentPath);
  const renderer = await ensureMarkdownRenderer();
  const html = renderer.render(markdown);

  if (articleTitle) {
    articleTitle.textContent = entry.title;
  }

  if (articleDescription) {
    articleDescription.textContent = entry.description || "";
  }

  if (articleMeta) {
    const pieces = [];
    if (entry.date) {
      pieces.push(`<span>${formatDate(entry.date)}</span>`);
    }
    if (entry.tags?.length) {
      pieces.push(entry.tags.map((tag) => `<span class="pill">${tag}</span>`).join(""));
    }
    articleMeta.innerHTML = pieces.join("");
  }

  articleBody.innerHTML = html;
  setDocumentMeta({
    title: entry.title,
    description: entry.description || SITE_CONFIG.description,
  });
}

function showError(message) {
  const target = byId("content-root");
  if (!target) {
    return;
  }

  target.innerHTML = `
    <section class="fallback-page">
      <h1>Unable to load page</h1>
      <p class="error-state">${message}</p>
      <p><a href="/blog/">Return to the blog</a></p>
    </section>
  `;
}

async function bootstrap() {
  installCloudflareAnalytics();
  buildHeader();
  buildFooter();

  const postSlug = document.body.dataset.postSlug;
  const pageId = document.body.dataset.pageId;
  const isBlogIndex = document.body.dataset.blogIndex === "true";
  const isHome = document.body.dataset.home === "true";
  const articleBody = byId("article-body");
  const postList = byId("post-list");

  if (isHome) {
    renderHome();
    return;
  }

  // Prefer the prerendered HTML path: no content-index / markdown fetch on the
  // critical path when the article or blog list is already in the document.
  if (isBlogIndex && isPrerendered(postList) && postList.children.length) {
    return;
  }
  if ((postSlug || pageId) && isPrerendered(articleBody) && articleBody.childNodes.length) {
    return;
  }

  const needsContentIndex = isBlogIndex || Boolean(postSlug) || Boolean(pageId);
  if (!needsContentIndex) {
    return;
  }

  try {
    const indexData = await loadContentIndex();

    if (isBlogIndex) {
      await renderBlogIndex(indexData);
      return;
    }

    if (postSlug) {
      const entry = indexData.posts.find((post) => post.slug === postSlug);
      if (!entry) {
        throw new Error("The requested post does not exist.");
      }
      await renderMarkdownPage(entry);
      return;
    }

    if (pageId) {
      const entry = indexData.pages.find((page) => page.id === pageId);
      if (!entry) {
        throw new Error("The requested page does not exist.");
      }
      await renderMarkdownPage(entry);
    }
  } catch (error) {
    showError(error.message);
  }
}

bootstrap();
