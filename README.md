Static GitHub Pages site built with plain HTML, CSS, and JavaScript.

Routes:

- `/` redirects to `/blog/`
- `/blog/` lists posts
- `/blog/<slug>/` renders individual markdown-backed posts
- `/about/` renders the about page

Content lives under `/content`, shared assets live under `/assets`, and GitHub Pages is configured for raw static hosting via `.nojekyll`.

## IndexNow (Bing / Yandex)

Search engines that support [IndexNow](https://www.indexnow.org/) can be notified when URLs change.

1. The key file at the site root (`2cc0a6c6bcca46c4ac742568ab395919.txt`) must be publicly reachable.
2. After deploying sitemap updates, submit URLs:

```bash
node scripts/indexnow-submit.mjs
```

The script reads `/sitemap.xml`, then POSTs to `https://api.indexnow.org/indexnow`.

