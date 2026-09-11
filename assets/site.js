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

function buildHeader() {
  const header = byId("site-header");
  if (!header) {
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
    <nav class="site-nav" aria-label="Primary">
      ${navLinks}
    </nav>
  `;
}

function buildFooter() {
  const footer = byId("site-footer");
  if (!footer) {
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

  const markdown = await loadMarkdown(entry.contentPath);
  const html = window.MarkdownRenderer.render(markdown);

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
  const needsContentIndex = isBlogIndex || Boolean(postSlug) || Boolean(pageId);

  if (isHome) {
    renderHome();
    return;
  }

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
