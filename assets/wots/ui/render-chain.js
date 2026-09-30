/**
 * Single-chain detail: top-down positions 0..15, site-themed DOM.
 * Only displays values from a precomputed execution trace.
 */

import { bytesToHex } from "../crypto/bytes.js";
import { CHAIN_LENGTH } from "./render-overview.js";

/**
 * @param {HTMLElement} root
 * @param {{
 *   scheme: string,
 *   nodes: Uint8Array[],
 *   steps: Array<{hashIndex:number, input:Uint8Array, output:Uint8Array, addressHex:string}>,
 *   counters: {sha256Calls:number, chainHashCalls:number},
 *   highlightIndex?: number | null,
 *   chainIndex?: number,
 *   sigIndex?: number | null
 * }} trace
 */
export function renderChain(root, trace) {
  const highlight =
    typeof trace.highlightIndex === "number" ? trace.highlightIndex : null;
  const chainIndex =
    typeof trace.chainIndex === "number" ? trace.chainIndex : 0;
  const sigIndex =
    typeof trace.sigIndex === "number" ? trace.sigIndex : highlight;
  const n = trace.nodes.length;

  if (n !== CHAIN_LENGTH) {
    throw new Error(`expected ${CHAIN_LENGTH} nodes, got ${n}`);
  }

  root.innerHTML = `
    <div class="chain-meta">
      <span><strong>Scheme</strong> ${escapeHtml(trace.scheme)}</span>
      <span><strong>Chain</strong> ${chainIndex}</span>
      <span><strong>SHA-256 calls</strong> ${trace.counters.sha256Calls}</span>
      <span><strong>Chain hashes</strong> ${trace.counters.chainHashCalls}</span>
    </div>
    <div class="wots-detail">
      <div class="wots-detail-chain">
        <span class="wots-chain-sk">sk<sub>${chainIndex}</sub></span>
        <div class="wots-detail-nodes" role="list"></div>
      </div>
    </div>
    <p class="chain-caption">Hashing moves only forward. Knowing a node lets you compute later positions, not earlier ones.</p>
    <details class="under-hood" open>
      <summary>Under the hood</summary>
      <div class="under-hood-body" data-hood></div>
    </details>
  `;

  const list = root.querySelector(".wots-detail-nodes");
  const hood = root.querySelector("[data-hood]");

  for (let i = 0; i < n; i += 1) {
    const short = bytesToHex(trace.nodes[i]).slice(0, 8);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wots-detail-node";
    btn.dataset.index = String(i);
    btn.setAttribute("role", "listitem");
    btn.title = `position ${i}`;
    btn.innerHTML = `
      <span class="wots-detail-pos">${i}</span>
      <span class="wots-detail-box" aria-hidden="true"></span>
      <span class="wots-detail-hash">${short}…</span>
    `;
    list.appendChild(btn);
  }

  const buttons = root.querySelectorAll(".wots-detail-node");

  function showStep(index) {
    buttons.forEach((btn) => {
      const i = Number(btn.dataset.index);
      btn.classList.toggle("is-active", i === index);
      btn.classList.toggle("is-sig", i === sigIndex);
      btn.classList.toggle("is-secret", i === 0);
      btn.classList.toggle("is-endpoint", i === n - 1);
    });

    if (index === 0) {
      hood.innerHTML = `
        <p><strong>Position 0</strong> is the secret chain start (PRF output). It is not produced by an F hash step.</p>
        <dl>
          <dt>Node bytes</dt><dd><code>${bytesToHex(trace.nodes[0])}</code></dd>
        </dl>
      `;
      return;
    }

    const step = trace.steps[index - 1];
    hood.innerHTML = `
      <p>Hash step from position <strong>${step.hashIndex}</strong> → <strong>${step.hashIndex + 1}</strong> using <code>F</code>.</p>
      <dl>
        <dt>Hash index (in ADRS)</dt><dd><code>${step.hashIndex}</code></dd>
        <dt>ADRS (22 bytes)</dt><dd><code>${step.addressHex}</code></dd>
        <dt>Input</dt><dd><code>${bytesToHex(step.input)}</code></dd>
        <dt>Output</dt><dd><code>${bytesToHex(step.output)}</code></dd>
      </dl>
    `;
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => showStep(Number(btn.dataset.index)));
  });

  showStep(highlight === null ? (sigIndex ?? 0) : highlight);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
