/**
 * XMSS narration: phases, step card, index / auth / pk summary.
 */

import { PHASE_TITLES, PHASE_COUNT } from "./sign-steps.js";
import { bytesToHex } from "../../wots/crypto/bytes.js";

/**
 * @param {HTMLElement} root
 * @param {ReturnType<import("./sign-steps.js").viewModelAt>} view
 * @param {object} trace
 * @param {{ onPhase?: (phase: number) => void }} [handlers]
 */
export function renderXmssNarration(root, view, trace, handlers = {}) {
  const { step, phase, stepIndex, totalSteps } = view;
  const { h } = trace.params;

  root.innerHTML = `
    <div class="wots-phase-bar xmss-phase-bar">
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
      <p class="wots-step-label">${escapeHtml(step.label)}</p>
      ${step.detail ? `<p class="wots-step-detail">${escapeHtml(step.detail)}</p>` : ""}
    </div>

    <div class="wots-mapping">
      <div class="wots-mapping-row">
        <span class="wots-mapping-key">message</span>
        <code class="wots-mapping-msg">${escapeHtml(trace.inputs.messageHex)}</code>
      </div>
      <div class="wots-mapping-row">
        <span class="wots-mapping-key">leaf idx</span>
        <div class="wots-digit-row">
          <span class="wots-digit ${view.selectedLeaf !== null ? "is-on" : ""} ${view.step.kind === "pick-leaf" ? "is-focus" : ""}">${
            view.selectedLeaf !== null ? view.selectedLeaf : "·"
          }</span>
        </div>
      </div>
      <div class="wots-mapping-row">
        <span class="wots-mapping-key">WOTS σ</span>
        ${
          view.wotsDone
            ? `<code class="wots-mapping-msg">${escapeHtml(trace.wots.signatureHex.slice(0, 24))}… (${trace.wots.signature.length} B)</code>`
            : `<span class="wots-muted">not yet</span>`
        }
      </div>
      <div class="wots-mapping-row">
        <span class="wots-mapping-key">auth</span>
        <div class="wots-sig-grid">
          ${trace.authPath
            .map((sib, j) => {
              const on = view.authRevealed[j];
              const focus =
                view.step.kind === "auth-sibling" && view.focusPathHeight === j;
              return `<span class="wots-sig-cell ${on ? "is-on" : ""} ${focus ? "is-focus" : ""}" title="${on ? bytesToHex(sib.hash) : "hidden"}">${on ? sib.short : "······"}</span>`;
            })
            .join("")}
        </div>
      </div>
      <div class="wots-mapping-row">
        <span class="wots-mapping-key">XMSS pk</span>
        ${
          view.pkShown
            ? `<code class="wots-mapping-msg">${escapeHtml(trace.publicKeyHex)}</code>`
            : `<span class="wots-muted">Merkle root — not yet</span>`
        }
      </div>
    </div>

    <p class="wots-note">
      Demo tree: height <strong>h=${h}</strong> (${1 << h} WOTS-TW leaves).
      Real XMSS / XMSS^MT use larger <code>h</code> (and often stacked trees); same leaf + auth-path idea.
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
