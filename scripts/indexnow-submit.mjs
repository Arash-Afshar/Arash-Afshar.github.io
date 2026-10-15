#!/usr/bin/env node
/**
 * Submit sitemap URLs to IndexNow (Bing, Yandex, and other supporting engines).
 *
 * Usage (from repo root, after deploy so the key file is live):
 *   node scripts/indexnow-submit.mjs
 *
 * Optional: pass extra absolute URLs as args; otherwise all <loc> values
 * from /sitemap.xml are submitted.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "arash-afshar.github.io";
const KEY = "2cc0a6c6bcca46c4ac742568ab395919";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

function urlsFromSitemap() {
  const xml = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  return [...new Set(locs)];
}

async function main() {
  const fromArgs = process.argv.slice(2).filter((u) => /^https?:\/\//i.test(u));
  const urlList = fromArgs.length ? fromArgs : urlsFromSitemap();

  if (!urlList.length) {
    console.error("No URLs to submit.");
    process.exit(1);
  }

  const body = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList,
  };

  console.log(`Submitting ${urlList.length} URL(s) to IndexNow…`);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log(`HTTP ${res.status}${text ? `: ${text}` : ""}`);
  if (!res.ok && res.status !== 202) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
