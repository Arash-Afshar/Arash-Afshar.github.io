#!/usr/bin/env node
/**
 * Prerender markdown bodies (and the blog index list) into static HTML so
 * crawlers / LLM fetchers see prose without executing JavaScript.
 *
 * Usage (from repo root):
 *   node scripts/prerender-content.mjs
 *
 * Re-run after editing content/posts/*.md, content/pages/*.md, or content-index.json.
 * Client-side site.js hydrates chrome and only re-renders markdown when needed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ORIGIN = "https://arash-afshar.github.io";
const SITE_NAME = "Technology and Security";
const AUTHOR_NAME = "Arash Afshar";
const INDEX_PATH = path.join(ROOT, "content", "content-index.json");

const DEMO_LOADERS = {
  wots: {
    module: "/assets/wots/app.js",
    mount: "#wots-demo",
    stylesheets: ["/assets/wots/styles.css"],
  },
  fors: {
    module: "/assets/fors/app.js",
    mount: "#fors-demo",
    stylesheets: ["/assets/wots/styles.css", "/assets/fors/styles.css"],
  },
  "wots-reuse": {
    module: "/assets/wots-reuse/app.js",
    mount: "#wots-reuse-demo",
    stylesheets: ["/assets/wots/styles.css", "/assets/wots-reuse/styles.css"],
  },
};

function loadMarkdownRenderer() {
  const source = fs.readFileSync(path.join(ROOT, "assets", "markdown.js"), "utf8");
  const sandbox = { window: {}, console };
  vm.runInNewContext(source, sandbox, { filename: "markdown.js" });
  if (!sandbox.window.MarkdownRenderer?.render) {
    throw new Error("MarkdownRenderer failed to load");
  }
  return sandbox.window.MarkdownRenderer;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

/**
 * Replace the innerHTML of the element with the given id, respecting nested
 * tags of the same name (unlike a non-greedy regex to the first closer).
 */
function replaceById(html, id, innerHtml, extraAttrs = {}) {
  const openRe = new RegExp(`<([a-zA-Z0-9]+)([^>]*\\bid="${id}"[^>]*)>`, "i");
  const openMatch = openRe.exec(html);
  if (!openMatch) {
    throw new Error(`Element #${id} not found`);
  }

  const tag = openMatch[1];
  let attrs = openMatch[2];
  const openStart = openMatch.index;
  const openEnd = openStart + openMatch[0].length;

  const scanner = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "gi");
  scanner.lastIndex = openEnd;
  let depth = 1;
  let closeStart = -1;
  let token;
  while ((token = scanner.exec(html)) !== null) {
    if (token[0][1] === "/") {
      depth -= 1;
      if (depth === 0) {
        closeStart = token.index;
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (closeStart < 0) {
    throw new Error(`Closing </${tag}> for #${id} not found`);
  }

  for (const [key, value] of Object.entries(extraAttrs)) {
    const attrPattern = new RegExp(`\\s${key}="[^"]*"`, "i");
    if (attrPattern.test(attrs)) {
      attrs = attrs.replace(attrPattern, ` ${key}="${value}"`);
    } else {
      attrs += ` ${key}="${value}"`;
    }
  }

  const closeEnd = closeStart + `</${tag}>`.length;
  return (
    html.slice(0, openStart) +
    `<${tag}${attrs}>${innerHtml}</${tag}>` +
    html.slice(closeEnd)
  );
}

function upsertHeadBlock(html, id, blockHtml) {
  const pattern = new RegExp(
    `<!-- prerender:${id} -->[\\s\\S]*?<!-- /prerender:${id} -->\\n?`,
    "i"
  );
  const wrapped = `<!-- prerender:${id} -->\n${blockHtml}<!-- /prerender:${id} -->\n`;
  if (pattern.test(html)) {
    return html.replace(pattern, wrapped);
  }
  return html.replace(/<\/head>/i, `${wrapped}</head>`);
}

function upsertJsonLd(html, payload) {
  const json = JSON.stringify(payload, null, 2);
  const block = `    <script type="application/ld+json" id="prerender-jsonld">\n${json}\n    </script>\n`;
  // Drop legacy unwrapped JSON-LD blocks before inserting the wrapped one.
  html = html.replace(
    /\s*<script type="application\/ld\+json" id="prerender-jsonld">[\s\S]*?<\/script>\n?/gi,
    "\n"
  );
  return upsertHeadBlock(html, "jsonld", block);
}

function upsertMetaDescription(html, description) {
  if (/<meta\s+name="description"/i.test(html)) {
    return html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta\n      name="description"\n      content="${escapeAttr(description)}"\n    >`
    );
  }
  return html.replace(
    /<\/title>/i,
    `</title>\n    <meta\n      name="description"\n      content="${escapeAttr(description)}"\n    >`
  );
}

function upsertSocialMeta(html, { title, description, url, type = "article", published }) {
  const lines = [
    `    <meta property="og:site_name" content="${escapeAttr(SITE_NAME)}">`,
    `    <meta property="og:type" content="${escapeAttr(type)}">`,
    `    <meta property="og:title" content="${escapeAttr(title)}">`,
    `    <meta property="og:description" content="${escapeAttr(description)}">`,
    `    <meta property="og:url" content="${escapeAttr(url)}">`,
    `    <meta name="twitter:card" content="summary">`,
    `    <meta name="twitter:title" content="${escapeAttr(title)}">`,
    `    <meta name="twitter:description" content="${escapeAttr(description)}">`,
  ];
  if (published) {
    lines.push(
      `    <meta property="article:published_time" content="${escapeAttr(published)}">`
    );
  }
  return upsertHeadBlock(html, "social", `${lines.join("\n")}\n`);
}

function ensureSitemapLink(html) {
  if (/rel="sitemap"/i.test(html)) {
    return html;
  }
  return html.replace(
    /<link rel="canonical"[^>]*>/i,
    (match) =>
      `${match}\n    <link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml">`
  );
}

function stripMarkdownScript(html) {
  return html.replace(
    /\s*<script[^>]*src="\/assets\/markdown\.js"[^>]*><\/script>\n?/gi,
    "\n"
  );
}

function ensureSiteScript(html) {
  if (/src="\/assets\/site\.js"/i.test(html)) {
    return html;
  }
  return html.replace(
    /<\/head>/i,
    `    <script defer src="/assets/site.js"></script>\n</head>`
  );
}

function buildChromeHeader() {
  return `
    <a class="brand" href="/">
      <span class="brand-copy">
        <span class="brand-title">${SITE_NAME}</span>
        <span class="brand-subtitle">${AUTHOR_NAME}</span>
      </span>
    </a>
    <div class="header-controls">
      <nav class="site-nav" aria-label="Primary">
        <a href="/">Home</a>
        <a href="/blog/">Blogs</a>
        <a href="/about/">About</a>
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
}

function buildChromeFooter() {
  return `
    <p>&copy; ${new Date().getFullYear()} ${SITE_NAME}. Hosted on GitHub Pages.</p>
  `;
}

function injectChrome(html) {
  html = replaceById(html, "site-header", buildChromeHeader(), {
    "data-prerendered": "true",
  });
  html = replaceById(html, "site-footer", buildChromeFooter(), {
    "data-prerendered": "true",
  });
  return html;
}

function demoNoscript(label) {
  return `
    <noscript>
      <p class="wots-note">This page includes an interactive ${escapeHtml(label)} that needs JavaScript. The article prose below is complete without it.</p>
    </noscript>`;
}

/** Static shell matching the JS apps so hydration does not expand a tiny placeholder (CLS). */
function demoShell(slug) {
  if (slug === "wots") {
    return `${demoNoscript("WOTS hash-chain demo")}
    <div class="wots-panel">
      <div id="wots-message-anchor" class="wots-message-anchor">
        <div class="wots-message-form">
          <label class="wots-field">
            <span>Message</span>
            <input id="msg-input" type="text" spellcheck="false"
              placeholder="Any text (hashed to 16 bytes), or 32 hex chars"
              value="A Sample Message to Sign">
          </label>
          <button type="button" id="btn-sign">Sign</button>
          <button type="button" id="btn-example">Example</button>
        </div>
        <p class="wots-note" id="msg-hint">Enter 32 hex chars, or text — text is SHA-256 truncated to 16 bytes.</p>
      </div>
      <div class="wots-controls">
        <button type="button" id="btn-prev-phase" disabled>⟵ Phase</button>
        <button type="button" id="btn-prev" disabled>Prev</button>
        <button type="button" id="btn-next" disabled>Next</button>
        <button type="button" id="btn-next-phase" disabled>Phase ⟶</button>
        <button type="button" id="btn-play" disabled>Play</button>
        <button type="button" id="btn-pause" disabled>Pause</button>
        <button type="button" id="btn-reset" disabled>Reset</button>
        <label>
          Step ms
          <input id="speed" type="number" min="40" max="2000" step="20" value="160">
        </label>
      </div>
      <p id="status" data-demo-placeholder>Loading interactive WOTS hash-chain demo…</p>
      <p class="wots-note wots-shortcuts">Keys: <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step · <kbd>P</kbd>/<kbd>N</kbd> phase</p>
      <div id="narration-root" class="demo-narration-slot"></div>
      <div id="overview-root" class="demo-overview-slot" aria-busy="true"></div>
    </div>
    <div class="wots-panel">
      <h2 class="section-title demo-key-title">Key material</h2>
      <p class="wots-note">Fixed demo seeds. Each chain has its own PRF-derived secret (shown as a short prefix in the grid). Intermediates stay secret except as the animation reveals them; public tips are the green endpoints.</p>
      <dl id="seed-info"></dl>
    </div>`;
  }

  if (slug === "fors") {
    return `${demoNoscript("FORS forest demo")}
    <div class="wots-panel">
      <div id="fors-message-anchor" class="wots-message-anchor">
        <div class="wots-message-form">
          <label class="wots-field">
            <span>Message</span>
            <input id="msg-input" type="text" spellcheck="false"
              placeholder="Any text, or 4 hex chars for the digest"
              value="A Sample Message to Sign">
          </label>
          <button type="button" id="btn-sign">Sign</button>
          <button type="button" id="btn-example">Example</button>
        </div>
        <p class="wots-note" id="msg-hint">
          Text is hashed with SHA-256 and truncated to 2 bytes
          (enough bits for k·a indexes). Or paste 4 hex chars.
        </p>
      </div>
      <div class="wots-controls">
        <button type="button" id="btn-prev-phase" disabled>⟵ Phase</button>
        <button type="button" id="btn-prev" disabled>Prev</button>
        <button type="button" id="btn-next" disabled>Next</button>
        <button type="button" id="btn-next-phase" disabled>Phase ⟶</button>
        <button type="button" id="btn-play" disabled>Play</button>
        <button type="button" id="btn-pause" disabled>Pause</button>
        <button type="button" id="btn-reset" disabled>Reset</button>
        <label>
          Step ms
          <input id="speed" type="number" min="40" max="2000" step="20" value="160">
        </label>
      </div>
      <p id="status" data-demo-placeholder>Loading interactive FORS forest demo…</p>
      <p class="wots-note wots-shortcuts">Keys: <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step · <kbd>P</kbd>/<kbd>N</kbd> phase</p>
      <div id="narration-root" class="demo-narration-slot"></div>
      <div id="overview-root" class="demo-overview-slot demo-overview-slot--fors" aria-busy="true"></div>
    </div>
    <div class="wots-panel">
      <h2 class="section-title demo-key-title">Key material</h2>
      <p class="wots-note">
        Fixed demo seeds (same as the WOTS posts). This page runs real SHRINCS FORS primitives
        (<code>PRF</code>, <code>F</code>, <code>H</code>, <code>T_k</code>) on a small forest so every node is visible.
      </p>
      <dl id="seed-info"></dl>
    </div>`;
  }

  if (slug === "wots-reuse") {
    return `${demoNoscript("WOTS key-reuse demo")}
    <div class="wots-panel">
      <div class="wots-reuse-pair">
        <div class="wots-reuse-msg">
          <span class="wots-reuse-msg-label">Message 1 (same key as the previous post)</span>
          <strong>A Sample Message to Sign</strong>
          <code data-hex1></code>
        </div>
        <div class="wots-reuse-msg">
          <span class="wots-reuse-msg-label">Message 2</span>
          <strong>An observer can forge after this signature</strong>
          <code data-hex2></code>
        </div>
      </div>
      <p id="status" data-kind="busy" data-demo-placeholder>Signing both messages with real WOTS-TW…</p>
    </div>
    <div class="wots-panel wots-reuse-panel wots-reuse-panel--legend">
      <h2 class="demo-panel-title">1 · Signature for message 1</h2>
      <p class="wots-note">Amber = revealed signature node on each chain. Green tip = public key.</p>
      <div id="grid1" class="demo-overview-slot" aria-busy="true"></div>
    </div>
    <div class="wots-panel wots-reuse-panel">
      <h2 class="demo-panel-title">2 · Signature for message 2</h2>
      <p class="wots-note">Same key, different digits. Wherever this amber cell sits <em>below</em> signature 1, the observer learns a lower node.</p>
      <div id="grid2" class="demo-overview-slot" aria-busy="true"></div>
    </div>
    <div class="wots-panel wots-reuse-panel">
      <h2 class="demo-panel-title">3 · What hashing can reach (public upward)</h2>
      <p class="wots-note">
        Solid amber = the <strong>leaked</strong> node (min of the two signature heights).
        Teal band = every node from that leak up to the public tip — the observer can
        recompute these with the public hash function alone. Empty cells below the leak stay secret (you cannot hash backward).
      </p>
      <div id="grid-zone" class="demo-overview-slot" aria-busy="true"></div>
    </div>
    <div class="wots-panel wots-reuse-panel">
      <h2 class="demo-panel-title">4 · Messages an observer can forge</h2>
      <p class="wots-note" id="forge-explainer">
        Any message whose Winternitz digits (including checksum) all sit inside the teal band is forgeable.
        Click one to place a forged signature node on each chain — built only by hashing upward from the leaks.
      </p>
      <ul class="wots-reuse-forge-list" id="forge-list"></ul>
      <div id="grid-forge" class="demo-overview-slot" aria-busy="true"></div>
    </div>
    <div class="wots-panel">
      <h2 class="section-title demo-key-title">Key material</h2>
      <p class="wots-note">Identical demo seeds as the <a href="/blog/wots/">WOTS hash chains</a> post — so these signatures are on the same keypair.</p>
      <dl id="seed-info"></dl>
    </div>`;
  }

  return `${demoNoscript("demo")}
    <div class="wots-panel demo-placeholder" data-demo-placeholder>
      <p class="wots-note">Loading interactive demo…</p>
    </div>`;
}

function ensureStylesheetLinks(html, hrefs) {
  for (const href of hrefs) {
    if (html.includes(`href="${href}"`)) {
      continue;
    }
    html = html.replace(
      /<link rel="stylesheet" href="\/assets\/styles\.css">/i,
      (match) => `${match}\n    <link rel="stylesheet" href="${href}">`
    );
  }
  return html;
}

function ensureDemoMount(html, slug) {
  const loader = DEMO_LOADERS[slug];
  if (!loader) {
    return html;
  }

  const mountId = loader.mount.slice(1);

  try {
    html = replaceById(html, mountId, demoShell(slug));
  } catch {
    // Mount may already have been customized; leave as-is.
  }

  // Demo CSS stays in <head>: late-injected stylesheet was a CLS source, and
  // FCP/LCP are already fast enough that this tradeoff is worth it.
  html = ensureStylesheetLinks(html, loader.stylesheets || []);

  const lazyBlock = `    <script type="module">
      import { loadDemo } from "/assets/lazy-demo.js";
      loadDemo("${loader.module}", "${loader.mount}");
    </script>\n`;

  html = html.replace(
    /<script type="module"[^>]*src="\/assets\/(?:wots|fors|wots-reuse)\/app\.js"[^>]*><\/script>\n?/gi,
    ""
  );
  html = html.replace(
    /<!-- prerender:demo-loader -->[\s\S]*?<!-- \/prerender:demo-loader -->\n?/gi,
    ""
  );
  html = html.replace(
    /<\/body>/i,
    `<!-- prerender:demo-loader -->\n${lazyBlock}<!-- /prerender:demo-loader -->\n</body>`
  );
  return html;
}

function readMarkdown(contentPath) {
  const relative = contentPath.replace(/^\//, "");
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function pagePathFromUrl(urlPath) {
  const trimmed = urlPath.replace(/\/$/, "") || "";
  if (!trimmed) {
    return path.join(ROOT, "index.html");
  }
  return path.join(ROOT, trimmed.replace(/^\//, ""), "index.html");
}

function buildPostListHtml(posts) {
  const sorted = posts
    .slice()
    .sort((left, right) => new Date(right.date) - new Date(left.date));
  return sorted
    .map((post) => {
      const tags = (post.tags || [])
        .map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`)
        .join("");
      return `
        <a class="post-card" href="${escapeHtml(post.url)}">
          <h2>${escapeHtml(post.title)}</h2>
          <p>${escapeHtml(post.summary || "")}</p>
          <div class="post-meta">
            <span>${escapeHtml(formatDate(post.date))}</span>
          </div>
          <div class="post-tags">${tags}</div>
        </a>`;
    })
    .join("\n");
}

function prerenderEntry(renderer, entry, { isPage = false } = {}) {
  const filePath = pagePathFromUrl(entry.url);
  if (!fs.existsSync(filePath)) {
    console.warn(`skip missing page: ${filePath}`);
    return;
  }

  let html = fs.readFileSync(filePath, "utf8");
  const markdown = readMarkdown(entry.contentPath);
  const bodyHtml = renderer.render(markdown);
  const description = entry.description || entry.summary || "";
  const absoluteUrl = `${SITE_ORIGIN}${entry.url}`;
  const pageTitle = `${entry.title} | ${SITE_NAME}`;

  html = upsertMetaDescription(html, description);
  html = ensureSitemapLink(html);
  html = stripMarkdownScript(html);
  html = ensureSiteScript(html);
  html = upsertSocialMeta(html, {
    title: pageTitle,
    description,
    url: absoluteUrl,
    type: isPage ? "website" : "article",
    published: entry.date,
  });
  html = replaceById(html, "article-description", escapeHtml(description));
  if (entry.date || entry.tags?.length) {
    const pieces = [];
    if (entry.date) {
      pieces.push(`<span>${escapeHtml(formatDate(entry.date))}</span>`);
    }
    if (entry.tags?.length) {
      pieces.push(
        entry.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")
      );
    }
    html = replaceById(html, "article-meta", pieces.join(""));
  }
  html = replaceById(html, "article-body", `\n${bodyHtml}\n`, {
    "data-prerendered": "true",
  });
  html = injectChrome(html);

  if (!isPage && entry.slug) {
    html = ensureDemoMount(html, entry.slug);
  }

  const jsonLd = isPage
    ? {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: entry.title,
        url: absoluteUrl,
        description,
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_ORIGIN },
        author: { "@type": "Person", name: AUTHOR_NAME, url: SITE_ORIGIN },
      }
    : {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: entry.title,
        description,
        datePublished: entry.date,
        url: absoluteUrl,
        mainEntityOfPage: absoluteUrl,
        inLanguage: "en",
        isPartOf: {
          "@type": "Blog",
          name: SITE_NAME,
          url: `${SITE_ORIGIN}/blog/`,
        },
        author: {
          "@type": "Person",
          name: AUTHOR_NAME,
          url: SITE_ORIGIN,
        },
        publisher: {
          "@type": "Person",
          name: AUTHOR_NAME,
          url: SITE_ORIGIN,
        },
        keywords: (entry.tags || []).join(", "),
      };
  html = upsertJsonLd(html, jsonLd);

  fs.writeFileSync(filePath, html);
  console.log(`prerendered ${entry.url}`);
}

function writeRobots() {
  const text = `User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
  fs.writeFileSync(path.join(ROOT, "robots.txt"), text);
  console.log("wrote /robots.txt");
}

function writeSitemap(indexData) {
  const urls = [
    { loc: `${SITE_ORIGIN}/`, priority: "1.0" },
    { loc: `${SITE_ORIGIN}/blog/`, priority: "0.9" },
    ...indexData.pages.map((page) => ({
      loc: `${SITE_ORIGIN}${page.url}`,
      priority: "0.6",
    })),
    ...indexData.posts.map((post) => ({
      loc: `${SITE_ORIGIN}${post.url}`,
      lastmod: post.date ? post.date.slice(0, 10) : undefined,
      priority: "0.8",
    })),
  ];

  const body = urls
    .map((entry) => {
      const last = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : "";
      return `  <url>
    <loc>${entry.loc}</loc>${last}
    <priority>${entry.priority}</priority>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml);
  console.log("wrote /sitemap.xml");
}

function writeLlmsTxt(indexData) {
  const series = indexData.posts
    .filter((post) => (post.tags || []).includes("post-quantum"))
    .slice()
    .sort((left, right) => new Date(left.date) - new Date(right.date));
  const other = indexData.posts
    .filter((post) => !(post.tags || []).includes("post-quantum"))
    .slice()
    .sort((left, right) => new Date(right.date) - new Date(left.date));

  const lines = [
    "# Technology and Security — Arash Afshar",
    "",
    `> ${SITE_ORIGIN}`,
    "",
    "Personal technical blog: applied cryptography, hash-based signatures, MPC, and systems notes.",
    "Interactive posts run real in-browser traces (not diagrams). Prefer the canonical URLs below when citing.",
    "",
    "## Hash-based signature series (interactive)",
    "",
  ];

  for (const post of series) {
    lines.push(`- [${post.title}](${SITE_ORIGIN}${post.url}): ${post.summary || post.description}`);
  }

  lines.push("", "## Other posts", "");
  for (const post of other) {
    lines.push(`- [${post.title}](${SITE_ORIGIN}${post.url}): ${post.summary || post.description}`);
  }

  lines.push(
    "",
    "## Pages",
    "",
    `- [About](${SITE_ORIGIN}/about/)`,
    `- [Blog index](${SITE_ORIGIN}/blog/)`,
    "",
    "## Machine-readable index",
    "",
    `- Content index JSON: ${SITE_ORIGIN}/content/content-index.json`,
    `- Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    ""
  );

  fs.writeFileSync(path.join(ROOT, "llms.txt"), `${lines.join("\n")}\n`);
  console.log("wrote /llms.txt");
}

function prerenderBlogIndex(indexData) {
  const filePath = path.join(ROOT, "blog", "index.html");
  let html = fs.readFileSync(filePath, "utf8");
  html = stripMarkdownScript(html);
  html = ensureSiteScript(html);
  html = ensureSitemapLink(html);
  html = upsertSocialMeta(html, {
    title: `Blog | ${SITE_NAME}`,
    description: "Technology, security, and software engineering writing by Arash Afshar.",
    url: `${SITE_ORIGIN}/blog/`,
    type: "website",
  });
  html = replaceById(html, "post-list", `\n${buildPostListHtml(indexData.posts)}\n`, {
    "data-prerendered": "true",
  });
  html = injectChrome(html);
  fs.writeFileSync(filePath, html);
  console.log("prerendered /blog/");
}

function prerenderHome() {
  const filePath = path.join(ROOT, "index.html");
  if (!fs.existsSync(filePath)) {
    return;
  }
  let html = fs.readFileSync(filePath, "utf8");
  html = stripMarkdownScript(html);
  html = ensureSiteScript(html);
  html = ensureSitemapLink(html);
  html = injectChrome(html);
  html = upsertSocialMeta(html, {
    title: "Arash Afshar | Applied Cryptographer",
    description:
      "Arash Afshar is a Senior Staff Applied Cryptographer at Coinbase, specializing in MPC, zero-knowledge proofs, and threshold cryptography.",
    url: `${SITE_ORIGIN}/`,
    type: "website",
  });
  fs.writeFileSync(filePath, html);
  console.log("prerendered /");
}

function main() {
  const renderer = loadMarkdownRenderer();
  const indexData = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));

  for (const post of indexData.posts) {
    prerenderEntry(renderer, post);
  }
  for (const page of indexData.pages) {
    prerenderEntry(renderer, page, { isPage: true });
  }
  prerenderBlogIndex(indexData);
  prerenderHome();
  writeRobots();
  writeSitemap(indexData);
  writeLlmsTxt(indexData);
}

main();
