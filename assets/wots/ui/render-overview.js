/**
 * Full WOTS-TW overview: 32 message + 3 checksum chains, positions 0..15.
 * Driven by a signing animation view-model (public endpoints, revealed nodes).
 */

import { bytesToHex } from "../crypto/bytes.js";
import { WOTS_TW } from "../crypto/wots-tw.js";

export const MESSAGE_CHAINS = WOTS_TW.messageChains;
export const CHECKSUM_CHAINS = WOTS_TW.checksumChains;
export const TOTAL_CHAINS = WOTS_TW.totalChains;
export const CHAIN_LENGTH = WOTS_TW.chainLength;

/**
 * @param {HTMLElement} root
 * @param {{
 *   chains: Array<{
 *     targetIndex: number,
 *     nodes: Uint8Array[],
 *     endpointShort: string,
 *     signatureShort: string,
 *   }>,
 *   view?: ReturnType<import("./sign-steps.js").viewModelAt> | null,
 *   selectedChain?: number | null,
 *   onSelect?: (chainIndex: number) => void
 * }} opts
 */
export function renderOverview(root, opts) {
  const { chains } = opts;
  if (!Array.isArray(chains) || chains.length !== TOTAL_CHAINS) {
    throw new Error(`expected ${TOTAL_CHAINS} chains`);
  }

  let shell = root.querySelector(".wots-overview");
  if (!shell) {
    root.innerHTML = buildShellHtml();
    shell = root.querySelector(".wots-overview");
    shell.addEventListener("click", (event) => {
      const col = event.target.closest("[data-chain]");
      if (!col || typeof shell._onSelect !== "function") {
        return;
      }
      shell._onSelect(Number(col.dataset.chain));
    });
  }

  root.removeAttribute("aria-busy");
  shell._onSelect = opts.onSelect;
  updateOverview(shell, opts);
}

function buildShellHtml() {
  const posLabels = Array.from(
    { length: CHAIN_LENGTH },
    (_, i) => `<span class="wots-pos-label">${i}</span>`
  ).join("");

  const messageCols = Array.from({ length: MESSAGE_CHAINS }, (_, i) =>
    chainColumnHtml(i)
  ).join("");
  const checksumCols = Array.from({ length: CHECKSUM_CHAINS }, (_, i) =>
    chainColumnHtml(MESSAGE_CHAINS + i)
  ).join("");

  return `
    <div class="wots-overview">
      <div class="wots-overview-legend">
        <span><i class="wots-swatch wots-swatch--empty"></i> unknown</span>
        <span><i class="wots-swatch wots-swatch--public"></i> public (pk tip)</span>
        <span><i class="wots-swatch wots-swatch--secret"></i> secret / computed</span>
        <span><i class="wots-swatch wots-swatch--sig"></i> signature node</span>
        <span><i class="wots-swatch wots-swatch--leak"></i> leaked node</span>
        <span><i class="wots-swatch wots-swatch--public-zone"></i> public hash upward</span>
        <span><i class="wots-swatch wots-swatch--active"></i> current step</span>
        <span>top labels = unique chain secrets (short hex)</span>
      </div>
      <div class="wots-overview-scroll">
        <div class="wots-overview-grid">
          <div class="wots-pos-axis" aria-hidden="true">
            <span class="wots-pos-head"></span>
            <span class="wots-pos-sk">pos</span>
            ${posLabels}
            <span class="wots-pos-foot">#</span>
          </div>
          <div class="wots-chain-block wots-chain-block--message">
            <div class="wots-group-label">message 0–31</div>
            <div class="wots-chain-group wots-chain-group--message" role="list" aria-label="Message chains 0 to 31">
              ${messageCols}
            </div>
          </div>
          <div class="wots-chain-divider" role="separator" aria-label="Message / checksum boundary"></div>
          <div class="wots-chain-block wots-chain-block--checksum">
            <div class="wots-group-label">checksum 32–34</div>
            <div class="wots-chain-group wots-chain-group--checksum" role="list" aria-label="Checksum chains 32 to 34">
              ${checksumCols}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function chainColumnHtml(chainIndex) {
  const nodes = Array.from({ length: CHAIN_LENGTH }, (_, pos) => {
    return `<span class="wots-node" data-pos="${pos}" title="chain ${chainIndex}, position ${pos}"><span class="wots-node-tag"></span></span>`;
  }).join("");

  return `
    <div class="wots-chain" data-chain="${chainIndex}" role="listitem">
      <span class="wots-chain-sk" data-sk title="chain ${chainIndex} secret"></span>
      <div class="wots-chain-nodes">${nodes}</div>
      <span class="wots-chain-idx">${chainIndex}</span>
    </div>
  `;
}

function updateOverview(shell, opts) {
  const { chains, view } = opts;
  const selected =
    typeof opts.selectedChain === "number" ? opts.selectedChain : null;

  const cols = shell.querySelectorAll(".wots-chain");
  cols.forEach((col) => {
    const chainIndex = Number(col.dataset.chain);
    const chain = chains[chainIndex];
    const st = view?.chainState?.[chainIndex];
    const isSelected = selected === chainIndex;
    const isTargetSelected = view?.selected?.[chainIndex] === true;
    const computedThrough = st ? st.computedThrough : -1;
    const revealedSig = st ? st.revealedSig : false;
    const focusPos = st ? st.focusPos : null;
    const collected = view?.signatureCollected?.[chainIndex] === true;

    col.classList.toggle("is-selected", isSelected);
    col.classList.toggle("is-target-selected", isTargetSelected);
    col.classList.toggle("is-sig-collected", collected);

    const skLabel = col.querySelector("[data-sk]");
    const secretShort = bytesToHex(chain.nodes[0]).slice(0, 4);
    skLabel.textContent = secretShort;
    skLabel.title = `chain ${chainIndex} secret (PRF output, not published): ${bytesToHex(chain.nodes[0])}`;

    const nodes = col.querySelectorAll(".wots-node");
    nodes.forEach((node) => {
      const pos = Number(node.dataset.pos);
      const tag = node.querySelector(".wots-node-tag");
      const isEndpoint = pos === CHAIN_LENGTH - 1;
      const isSigPos = pos === chain.targetIndex;
      const isFocus = focusPos === pos;
      const isComputed = computedThrough >= 0 && pos <= computedThrough;
      const isSecretComputed = isComputed && pos < chain.targetIndex;
      const isSigVisible = revealedSig && isSigPos;
      const publicFrom =
        typeof st?.publicFrom === "number" ? st.publicFrom : null;
      const isPublicZone =
        publicFrom !== null && pos >= publicFrom && pos <= CHAIN_LENGTH - 1;
      const isLeak = publicFrom !== null && pos === publicFrom;
      const short = bytesToHex(chain.nodes[pos]).slice(0, 6);

      node.className = "wots-node";
      if (isEndpoint) {
        node.classList.add("is-public");
      }
      if (isPublicZone) {
        node.classList.add("is-public-zone");
      }
      if (isLeak) {
        node.classList.add("is-leak");
      }
      if (isTargetSelected && isSigPos) {
        node.classList.add("is-target");
      }
      if (isComputed && pos === 0 && publicFrom === null) {
        node.classList.add("is-secret");
      }
      if (
        publicFrom === null &&
        (isSecretComputed || (isComputed && pos === 0))
      ) {
        node.classList.add("is-computed-secret");
      }
      if (isSigVisible || (collected && isSigPos && publicFrom === null)) {
        node.classList.add("is-sig");
      }
      if (isFocus) {
        node.classList.add("is-active");
      }

      // Squares stay compact; commit-style prefixes live in pk row + focus panel.
      tag.textContent = "";

      let title = `chain ${chainIndex}, position ${pos}`;
      if (isLeak) {
        title += ` — leaked node ${short} (observer knows this)`;
      } else if (isPublicZone && isEndpoint) {
        title += ` — public pk ${short} (reachable by hashing upward)`;
      } else if (isPublicZone) {
        title += ` — publicly computable by hashing from the leak ${short}`;
      } else if (isEndpoint) {
        title += ` — public pk ${short}`;
      } else if (isSigVisible) {
        title += ` — signature ${short}`;
      } else if (isComputed && pos === 0) {
        title += ` — secret ${short} (not published)`;
      } else if (isComputed) {
        title += ` — computed ${short} (not published)`;
      } else {
        title += " — unknown to observer";
      }
      node.title = title;
    });
  });
}
