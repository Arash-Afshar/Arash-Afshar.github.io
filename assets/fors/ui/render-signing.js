/**
 * FORS narration: phases, step card, index/signature summary.
 * Uses shared wots-* chrome classes for visual consistency with the WOTS post.
 */

import { PHASE_TITLES, PHASE_COUNT } from "./sign-steps.js";
import { bytesToHex } from "../../wots/crypto/bytes.js";

/**
 * @param {HTMLElement} root
 * @param {ReturnType<import("./sign-steps.js").viewModelAt>} view
 * @param {object} trace
 * @param {{ onPhase?: (phase: number) => void }} [handlers]
 */
export function renderForsNarration(root, view, trace, handlers = {}) {
  const { step, phase, stepIndex, totalSteps } = view;
  const { k, a } = trace.params;

  root.innerHTML = `
    <div class="wots-phase-bar fors-phase-bar">
      ${Array.from({ length: PHASE_COUNT }, (_, i) => i + 1)
        .map(
          (p) => `
        <button type="button" class="wots-phase-chip ${p === phase ? "is-current" : ""} ${p < phase ? "is-done" : ""}" data-phase="${p}">
          <span class="wots-phase-num">${p}</span>
          <span class="wots-phase-title">${PHASE_TITLES[p]}</span>
        </button>`
        )
        .join("")}
    </div>

    <div class="wots-step-card">
      <div class="wots-step-meta">Phase ${phase} · step ${stepIndex + 1} / ${totalSteps}</div>
      <h3 class="wots-step-label">${escapeHtml(step.label)}</h3>
      ${step.detail ? `<p class="wots-step-detail">${escapeHtml(step.detail)}</p>` : ""}
    </div>

    <div class="wots-mapping">
      <div class="wots-mapping-row">
        <span class="wots-mapping-key">digest</span>
        <code class="wots-mapping-msg">${escapeHtml(formatDigestWithBits(trace.inputs.messageDigestHex, a))}</code>
      </div>
      <div class="wots-mapping-row">
        <span class="wots-mapping-key">indexes</span>
        <div class="wots-digit-row">
          ${trace.indexes
            .map((ix, i) => {
              const on = view.indexesRevealed[i];
              const focus =
                view.focusTree === i && view.step.kind === "index";
              return `<span class="wots-digit ${on ? "is-on" : ""} ${focus ? "is-focus" : ""}" title="tree ${i}">${on ? ix : "·"}</span>`;
            })
            .join("")}
        </div>
      </div>
      <div class="wots-mapping-row">
        <span class="wots-mapping-key">σ leaves</span>
        <div class="wots-sig-grid">
          ${trace.trees
            .map((tree, i) => {
              const on = view.skRevealed[i];
              const focus =
                view.focusTree === i && view.step.kind === "reveal-sk";
              return `<span class="wots-sig-cell ${on ? "is-on" : ""} ${focus ? "is-focus" : ""}" title="${on ? bytesToHex(tree.preimage) : "hidden"}">${on ? tree.preimageShort : "······"}</span>`;
            })
            .join("")}
        </div>
      </div>
      <div class="wots-mapping-row">
        <span class="wots-mapping-key">roots</span>
        <div class="wots-sig-grid">
          ${trace.trees
            .map((tree, i) => {
              const on = view.rootReady[i];
              return `<span class="wots-sig-cell ${on ? "is-on" : ""}">${on ? tree.rootShort : "······"}</span>`;
            })
            .join("")}
        </div>
      </div>
      <div class="wots-mapping-row">
        <span class="wots-mapping-key">FORS pk</span>
        ${
          view.pkShown
            ? `<code class="wots-mapping-msg">${escapeHtml(trace.publicKeyHex)}</code>`
            : `<span class="wots-muted">T_k(roots) — not yet</span>`
        }
      </div>
    </div>

    <p class="wots-note">
      Demo forest: <strong>k=${k}</strong> trees of height <strong>a=${a}</strong>
      (${1 << a} leaves each). SHRINCS production uses k=10, a=13 — same algorithms, larger forest.
    </p>
  `;

  if (typeof handlers.onPhase === "function") {
    root.querySelectorAll("[data-phase]").forEach((btn) => {
      btn.addEventListener("click", () => {
        handlers.onPhase(Number(btn.dataset.phase));
      });
    });
  }
}

function formatDigestWithBits(hex, bitsPerGroup) {
  const bits = hex
    .replace(/[^0-9a-fA-F]/g, "")
    .split("")
    .map((ch) => parseInt(ch, 16).toString(2).padStart(4, "0"))
    .join("");
  const grouped =
    bits.match(new RegExp(`.{1,${bitsPerGroup}}`, "g"))?.join(" ") ?? bits;
  return `${hex}: ${grouped}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
