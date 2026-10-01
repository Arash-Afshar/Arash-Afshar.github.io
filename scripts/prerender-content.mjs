#!/usr/bin/env node
/**
 * Prerender markdown bodies (and the blog index list) into static HTML so
 * crawlers / LLM fetchers see prose without executing JavaScript.
 *
 * Usage (from repo root):
 *   node scripts/prerender-content.mjs
 *
 * Re-run after editing content/posts/*.md, content/pages/*.md, or content-index.json.
 * Client-side site.js still hydrates from markdown when JS is available.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ORIGIN = "https://arash-afshar.github.io";
const INDEX_PATH = path.join(ROOT, "content", "content-index.json");

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

function replaceById(html, id, innerHtml, extraAttrs = "") {
  const pattern = new RegExp(
    `(<([a-zA-Z0-9]+)([^>]*\\bid="${id}"[^>]*)>)([\\s\\S]*?)(<\\/\\2>)`,
    "i"
  );
  if (!pattern.test(html)) {
    throw new Error(`Element #${id} not found`);
  }
  return html.replace(pattern, (_, _open, tag, attrs) => {
    let nextAttrs = attrs;
    for (const [key, value] of Object.entries(extraAttrs)) {
      const attrPattern = new RegExp(`\\s${key}="[^"]*"`, "i");
      if (attrPattern.test(nextAttrs)) {
        nextAttrs = nextAttrs.replace(attrPattern, ` ${key}="${value}"`);
      } else {
        nextAttrs += ` ${key}="${value}"`;
      }
    }
    return `<${tag}${nextAttrs}>${innerHtml}</${tag}>`;
  });
}

function upsertJsonLd(html, payload) {
  const json = JSON.stringify(payload, null, 2);
  const block = `    <script type="application/ld+json" id="prerender-jsonld">\n${json}\n    </script>\n`;
  if (/id="prerender-jsonld"/.test(html)) {
    return html.replace(
      /<script type="application\/ld\+json" id="prerender-jsonld">[\s\S]*?<\/script>\n?/i,
      block
    );
  }
  return html.replace(/<\/head>/i, `${block}</head>`);
}

function upsertMetaDescription(html, description) {
  if (/<meta\s+name="description"/i.test(html)) {
    return html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta\n      name="description"\n      content="${escapeHtml(description)}"\n    >`
    );
  }
  return html.replace(
    /<\/title>/i,
    `</title>\n    <meta\n      name="description"\n      content="${escapeHtml(description)}"\n    >`
  );
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

  html = upsertMetaDescription(html, description);
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

  const absoluteUrl = `${SITE_ORIGIN}${entry.url}`;
  const jsonLd = isPage
    ? {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: entry.title,
        url: absoluteUrl,
        description,
        isPartOf: { "@type": "WebSite", name: "Technology and Security", url: SITE_ORIGIN },
      }
    : {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: entry.title,
        description,
        datePublished: entry.date,
        url: absoluteUrl,
        mainEntityOfPage: absoluteUrl,
        author: {
          "@type": "Person",
          name: "Arash Afshar",
          url: SITE_ORIGIN,
        },
        publisher: {
          "@type": "Person",
          name: "Arash Afshar",
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
  html = replaceById(html, "post-list", `\n${buildPostListHtml(indexData.posts)}\n`, {
    "data-prerendered": "true",
  });
  fs.writeFileSync(filePath, html);
  console.log("prerendered /blog/");
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
  writeRobots();
  writeSitemap(indexData);
  writeLlmsTxt(indexData);
}

main();
