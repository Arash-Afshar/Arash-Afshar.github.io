/**
 * WOTS key-reuse demo: two honest signatures + public-hash zone + forgeries.
 * Same demo seeds as /blog/wots/.
 */

import { hexToBytes, bytesToHex } from "../wots/crypto/bytes.js";
import { sha256 } from "../wots/crypto/sha256.js";
import { signWotsTw, mapMessageWotsTw, WOTS_TW } from "../wots/crypto/wots-tw.js";
import { renderOverview } from "../wots/ui/render-overview.js";
import {
  leakFloor,
  isForgeable,
  viewForSignedTrace,
  viewForPublicHashZone,
  viewForForgedInZone,
} from "../wots/crypto/reuse.js";

/** Same key material as the first WOTS post. */
const DEMO = {
  pkSeed: "000102030405060708090a0b0c0d0e0f",
  skSeed: "101112131415161718191a1b1c1d1e1f",
  keypairIndex: 7,
  message1: "A Sample Message to Sign",
  message2: "An observer can forge after this signature",
  /** Precomputed texts whose digits sit above min(sig1, sig2). */
  forgeries: [
    "Please transfer $125051",
    "Pay Alice $62720",
    "Pay Bob $68082",
    "Approve invoice #21738",
    "Ship order #55937",
    "Refund customer $13713",
  ],
};

function byId(id) {
  return document.getElementById(id);
}

async function messageTo16(text) {
  const digest = await sha256(new TextEncoder().encode(text));
  return digest.slice(0, 16);
}

function ensureShell(root) {
  root.classList.add("wots-demo", "wots-reuse-demo");
  if (byId("grid1") && byId("grid2") && byId("grid-zone") && byId("grid-forge")) {
    return;
  }

  root.innerHTML = `
    <div class="wots-panel">
      <div class="wots-reuse-pair">
        <div class="wots-reuse-msg">
          <span class="wots-reuse-msg-label">Message 1 (same key as the previous post)</span>
          <strong>${escapeHtml(DEMO.message1)}</strong>
          <code data-hex1></code>
        </div>
        <div class="wots-reuse-msg">
          <span class="wots-reuse-msg-label">Message 2</span>
          <strong>${escapeHtml(DEMO.message2)}</strong>
          <code data-hex2></code>
        </div>
      </div>
      <p id="status" data-kind="busy">Signing both messages with real WOTS-TW…</p>
    </div>

    <div class="wots-panel wots-reuse-panel wots-reuse-panel--legend">
      <h2 class="demo-panel-title">1 · Signature for message 1</h2>
      <p class="wots-note">Amber = revealed signature node on each chain. Green tip = public key.</p>
      <div id="grid1" class="demo-overview-slot"></div>
    </div>

    <div class="wots-panel wots-reuse-panel">
      <h2 class="demo-panel-title">2 · Signature for message 2</h2>
      <p class="wots-note">Same key, different digits. Wherever this amber cell sits <em>below</em> signature 1, the observer learns a lower node.</p>
      <div id="grid2" class="demo-overview-slot"></div>
    </div>

    <div class="wots-panel wots-reuse-panel">
      <h2 class="demo-panel-title">3 · What hashing can reach (public upward)</h2>
      <p class="wots-note">
        Solid amber = the <strong>leaked</strong> node (min of the two signature heights).
        Teal band = every node from that leak up to the public tip — the observer can
        recompute these with the public hash function alone. Empty cells below the leak stay secret (you cannot hash backward).
      </p>
      <div id="grid-zone" class="demo-overview-slot"></div>
    </div>

    <div class="wots-panel wots-reuse-panel">
      <h2 class="demo-panel-title">4 · Messages an observer can forge</h2>
      <p class="wots-note" id="forge-explainer">
        Any message whose Winternitz digits (including checksum) all sit inside the teal band is forgeable.
        Click one to place a forged signature node on each chain — built only by hashing upward from the leaks.
      </p>
      <ul class="wots-reuse-forge-list" id="forge-list"></ul>
      <div id="grid-forge" class="demo-overview-slot"></div>
    </div>

    <div class="wots-panel">
      <h2 class="section-title demo-key-title">Key material</h2>
      <p class="wots-note">Identical demo seeds as the <a href="/blog/wots/">WOTS hash chains</a> post — so these signatures are on the same keypair.</p>
      <dl id="seed-info"></dl>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function setStatus(text, kind) {
  const el = byId("status");
  el.textContent = text;
  el.dataset.kind = kind || "";
}

function paintGrid(root, chains, view) {
  renderOverview(root, {
    chains,
    view,
    selectedChain: null,
    onSelect: null,
  });
}

async function main() {
  const mount = document.getElementById("wots-reuse-demo");
  if (!mount) {
    return;
  }
  ensureShell(mount);

  const pkSeed = hexToBytes(DEMO.pkSeed);
  const skSeed = hexToBytes(DEMO.skSeed);

  byId("seed-info").innerHTML = `
    <dt>pk_seed</dt><dd><code>${DEMO.pkSeed}</code></dd>
    <dt>sk_seed</dt><dd><code>${DEMO.skSeed}</code></dd>
    <dt>keypair index</dt><dd><code>${DEMO.keypairIndex}</code></dd>
    <dt>params</dt><dd>n=${WOTS_TW.n}, w=${WOTS_TW.w}, chains=${WOTS_TW.totalChains}</dd>
  `;

  try {
    const bytes1 = await messageTo16(DEMO.message1);
    const bytes2 = await messageTo16(DEMO.message2);
    mount.querySelector("[data-hex1]").textContent = `SHA-256[:16] = ${bytesToHex(bytes1)}`;
    mount.querySelector("[data-hex2]").textContent = `SHA-256[:16] = ${bytesToHex(bytes2)}`;

    const trace1 = await signWotsTw({
      message: bytes1,
      pkSeed,
      skSeed,
      keypairIndex: DEMO.keypairIndex,
    });
    const trace2 = await signWotsTw({
      message: bytes2,
      pkSeed,
      skSeed,
      keypairIndex: DEMO.keypairIndex,
    });

    const floor = leakFloor(
      trace1.mapping.finalIndexes,
      trace2.mapping.finalIndexes
    );

    paintGrid(byId("grid1"), trace1.chains, viewForSignedTrace(trace1));
    paintGrid(byId("grid2"), trace2.chains, viewForSignedTrace(trace2));

    const zone = viewForPublicHashZone(trace1, floor);
    paintGrid(byId("grid-zone"), zone.chains, zone.view);

    const forgeList = byId("forge-list");
    const forgeMaps = [];
    for (const text of DEMO.forgeries) {
      const bytes = await messageTo16(text);
      const mapping = mapMessageWotsTw(bytes);
      if (!isForgeable(mapping.finalIndexes, floor)) {
        throw new Error(`precomputed forgery is not forgeable: ${text}`);
      }
      forgeMaps.push({ text, mapping, bytes });
    }

    let active = 0;

    function showForge(index) {
      active = index;
      forgeList.querySelectorAll("button").forEach((btn, i) => {
        btn.classList.toggle("is-active", i === active);
      });
      const { text, mapping } = forgeMaps[active];
      const packed = viewForForgedInZone(trace1, floor, mapping.finalIndexes);
      paintGrid(byId("grid-forge"), packed.chains, packed.view);
      byId("forge-explainer").innerHTML = `
        Forged message <strong>${escapeHtml(text)}</strong>.
        Teal = still the public-hash band from each leak. Amber hatch = forged σᵢ
        (a node inside that band). Empty cells below the leak were never needed.
      `;
    }

    forgeList.innerHTML = forgeMaps
      .map(
        (item, i) =>
          `<li><button type="button" data-forge="${i}">${escapeHtml(item.text)}</button></li>`
      )
      .join("");

    forgeList.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-forge]");
      if (!btn) {
        return;
      }
      showForge(Number(btn.dataset.forge));
    });

    showForge(0);

    const leakCount = floor.filter(
      (f, i) =>
        f <
        Math.max(
          trace1.mapping.finalIndexes[i],
          trace2.mapping.finalIndexes[i]
        )
    ).length;

    setStatus(
      `Signed both messages. On ${leakCount}/${WOTS_TW.totalChains} chains a lower node leaked — teal bands in grid 3 are publicly hashable; ${forgeMaps.length} example forgeries in grid 4.`,
      "ok"
    );
  } catch (error) {
    console.error(error);
    setStatus(`Failed: ${error.message}`, "error");
  }
}

main();
