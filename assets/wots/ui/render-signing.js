/**
 * Signing narration panels: message mapping, phase status, signature assembly.
 */

import { WOTS_TW } from "../crypto/wots-tw.js";
import { PHASE_TITLES, PHASE_COUNT } from "./sign-steps.js";
import { bytesToHex } from "../crypto/bytes.js";

/** Preserve “show full σ” expand state across step re-renders. */
let sigDetailsOpen = false;

/**
 * @param {HTMLElement} root
 * @param {ReturnType<import("./sign-steps.js").viewModelAt>} view
 * @param {object} trace
 * @param {{ onPhase?: (phase: number) => void }} [handlers]
 */
export function renderSignNarration(root, view, trace, handlers = {}) {
  const { step, phase, stepIndex, totalSteps, mapping } = view;

  root.innerHTML = `
    <div class="wots-phase-bar">
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
        <span class="wots-mapping-key">4-bit chunks</span>
        <div class="wots-chunk-row" data-chunks></div>
      </div>
      <div class="wots-mapping-row">
        <span class="wots-mapping-key">digits</span>
        <div class="wots-digit-row" data-digits></div>
      </div>
      ${
        view.checksumSumShown || phase >= 2
          ? `<div class="wots-mapping-row">
        <span class="wots-mapping-key">checksum</span>
        <div class="wots-checksum" data-checksum></div>
      </div>`
          : ""
      }
    </div>

    <div class="wots-focus" data-focus></div>

    <div class="wots-signature-panel">
      <div class="wots-mapping-key">signature σ (35 × 16 bytes)</div>
      <div class="wots-sig-grid" data-sig></div>
      ${
        view.signatureDone
          ? `<details class="wots-sig-details" data-sig-details ${sigDetailsOpen ? "open" : ""}>
              <summary>
                <span class="wots-sig-toggle-closed">[+]</span>
                <span class="wots-sig-toggle-open">[−]</span>
                Show full signature (560 bytes)
              </summary>
              <code class="wots-sig-full-code">${escapeHtml(trace.signatureHex)}</code>
            </details>`
          : ""
      }
    </div>
  `;

  const chunkRow = root.querySelector("[data-chunks]");
  chunkRow.innerHTML = mapping.nibbles
    .map((nibble, i) => {
      const on = view.chunksRevealed[i];
      return `<span class="wots-chunk ${on ? "is-on" : ""} ${view.step.chunkIndex === i && view.step.phase === 1 ? "is-focus" : ""}">${on ? nibble : "·"}</span>`;
    })
    .join("");

  const digitRow = root.querySelector("[data-digits]");
  digitRow.innerHTML = mapping.messageIndexes
    .map((d, i) => {
      const on = view.digitsRevealed[i];
      return `<span class="wots-digit ${on ? "is-on" : ""} ${view.step.chunkIndex === i && (view.step.kind === "chunk" || view.step.kind === "digit") ? "is-focus" : ""}">${on ? d : "·"}</span>`;
    })
    .join("");

  const checksumEl = root.querySelector("[data-checksum]");
  if (checksumEl) {
    checksumEl.innerHTML = renderChecksumPanel(view, mapping);
  }

  const focus = root.querySelector("[data-focus]");
  focus.innerHTML = renderFocus(view, trace);

  const sigGrid = root.querySelector("[data-sig]");
  sigGrid.innerHTML = trace.chains
    .map((chain, i) => {
      const on = view.signatureCollected[i];
      const focus =
        step.kind === "sig-collect" && step.chainIndex === i ? "is-focus" : "";
      const short = on ? chain.signatureShort : "······";
      const full = bytesToHex(chain.signatureElement);
      const title = on
        ? `σ_${i} = ${full}`
        : `σ_${i} (not yet placed)`;
      return `<span class="wots-sig-cell ${on ? "is-on" : ""} ${focus}" title="${title}">${short}</span>`;
    })
    .join("");

  const details = root.querySelector("[data-sig-details]");
  if (details) {
    details.addEventListener("toggle", () => {
      sigDetailsOpen = details.open;
    });
  }

  if (typeof handlers.onPhase === "function") {
    root.querySelectorAll("[data-phase]").forEach((btn) => {
      btn.addEventListener("click", () => {
        handlers.onPhase(Number(btn.dataset.phase));
      });
    });
  }
}

function renderChecksumPanel(view, mapping) {
  if (!view.checksumSumShown) {
    return `<span class="wots-muted">computing…</span>`;
  }

  const focusKind = view.step.kind;
  const parts = [];

  parts.push(
    `<span class="wots-csum-bit ${focusKind === "checksum-sum" ? "is-focus" : ""}">Σ=<strong>${mapping.digitSum}</strong></span>`
  );

  if (view.checksumMaxShown) {
    parts.push(`<span class="wots-csum-sep">·</span>`);
    parts.push(
      `<span class="wots-csum-bit ${focusKind === "checksum-max" ? "is-focus" : ""}" title="32 digits × 15">max=<strong>${WOTS_TW.checksumMax}</strong></span>`
    );
  } else {
    parts.push(`<span class="wots-csum-sep wots-muted">·</span>`);
    parts.push(`<span class="wots-muted">max=…</span>`);
  }

  if (view.checksumValueShown) {
    parts.push(`<span class="wots-csum-sep">·</span>`);
    parts.push(
      `<span class="wots-csum-bit ${focusKind === "checksum-sub" ? "is-focus" : ""}">${WOTS_TW.checksumMax}−${mapping.digitSum}=<strong>${mapping.checksum}</strong></span>`
    );
  } else if (view.checksumMaxShown) {
    parts.push(`<span class="wots-csum-sep wots-muted">·</span>`);
    parts.push(`<span class="wots-muted">csum=…</span>`);
  }

  if (view.checksumEncoded) {
    const hex = mapping.checksumHex.toUpperCase();
    const encodeFocus =
      focusKind === "checksum-encode" || focusKind === "checksum-digit";
    parts.push(`<span class="wots-csum-sep">·</span>`);
    parts.push(
      `<span class="wots-csum-bit ${encodeFocus ? "is-focus" : ""}">0x${hex}</span>`
    );
    parts.push(`<span class="wots-csum-sep">→</span>`);
    parts.push(
      `<span class="wots-csum-digits">${[0, 1, 2]
        .map((i) => {
          const on = view.checksumDigitsRevealed[i];
          const focus =
            focusKind === "checksum-digit" && view.step.chainIndex === 32 + i;
          return `<span class="wots-digit ${on ? "is-on" : ""} ${focus ? "is-focus" : ""}" title="chain ${32 + i}">${on ? mapping.checksumIndexes[i] : "·"}</span>`;
        })
        .join("")}</span>`
    );
  }

  return `<div class="wots-csum-inline">${parts.join("")}</div>`;
}

function renderFocus(view, trace) {
  const { step, mapping } = view;

  if (step.kind === "checksum-sum") {
    return `
      <div class="wots-focus-card wots-focus-card--rail">
        <div class="wots-focus-head">
          <strong>Checksum · Σ</strong>
          <span class="wots-muted">sum the message digits</span>
        </div>
        <div class="wots-hash-rail wots-hash-rail--idle wots-csum-focus">
          <p class="wots-csum-focus-math">Add the 32 digits above → Σ = <strong>${mapping.digitSum}</strong></p>
        </div>
      </div>`;
  }

  if (step.kind === "checksum-max") {
    return `
      <div class="wots-focus-card wots-focus-card--rail">
        <div class="wots-focus-head">
          <strong>Checksum · max</strong>
          <span class="wots-muted">where ${WOTS_TW.checksumMax} comes from</span>
        </div>
        <div class="wots-hash-rail wots-hash-rail--idle wots-csum-focus">
          <p class="wots-csum-focus-math">32 digits × 15 max each = <strong>${WOTS_TW.checksumMax}</strong> · Σ is already ${mapping.digitSum}</p>
        </div>
      </div>`;
  }

  if (step.kind === "checksum-sub") {
    return `
      <div class="wots-focus-card wots-focus-card--rail">
        <div class="wots-focus-head">
          <strong>Checksum · subtract</strong>
          <span class="wots-muted">ceiling − Σ</span>
        </div>
        <div class="wots-hash-rail wots-hash-rail--idle wots-csum-focus">
          <p class="wots-csum-focus-math">${WOTS_TW.checksumMax} − ${mapping.digitSum} = <strong>${mapping.checksum}</strong> — raising a message digit forces the checksum down</p>
        </div>
      </div>`;
  }

  if (step.kind === "checksum-encode" || step.kind === "checksum-digit") {
    return `
      <div class="wots-focus-card wots-focus-card--rail">
        <div class="wots-focus-head">
          <strong>Checksum · nibbles</strong>
          <span class="wots-muted">three base-16 digits → chains 32–34</span>
        </div>
        <div class="wots-hash-rail wots-hash-rail--idle wots-csum-focus">
          <p class="wots-csum-focus-math">${mapping.checksum} = 0x${mapping.checksumHex.toUpperCase()} → [<strong>${mapping.checksumIndexes.join(", ")}</strong>]</p>
        </div>
      </div>`;
  }

  if (step.phase === 5) {
    return `
      <div class="wots-focus-card wots-focus-card--rail">
        <div class="wots-focus-head">
          <strong>Signature complete</strong>
          <span class="wots-muted">all 35 slots filled</span>
        </div>
        <div class="wots-hash-rail wots-hash-rail--idle">
          <span class="wots-muted">σ is ready — expand [+] under the signature grid for the full 560-byte hex. Hover a slot for that σᵢ.</span>
        </div>
      </div>`;
  }

  if (step.phase === 3 && typeof step.chainIndex === "number") {
    const chain = trace.chains[step.chainIndex];
    return renderHashRail(chain, {
      computedThrough: -1,
      revealedSig: false,
      focusPos: chain.targetIndex,
      mode: "select",
    });
  }

  if (typeof step.chainIndex === "number" && step.phase >= 4) {
    const chain = trace.chains[step.chainIndex];
    const st = view.chainState[step.chainIndex];
    return renderHashRail(chain, {
      computedThrough: st.computedThrough,
      revealedSig: st.revealedSig,
      focusPos: st.focusPos,
      collected: view.signatureCollected[step.chainIndex],
      mode: "hash",
    });
  }

  return `
    <div class="wots-focus-card wots-focus-card--rail">
      <div class="wots-focus-head">
        <strong>Chain walk</strong>
        <span class="wots-muted">phases 3–4</span>
      </div>
      <div class="wots-hash-rail wots-hash-rail--idle">
        <span class="wots-muted">Select a chain position, then watch that chain’s secret hash forward into σ.</span>
      </div>
    </div>`;
}

/**
 * Fixed-height horizontal rail: positions 0…target fill in place; pk tip stays anchored.
 */
function renderHashRail(chain, state) {
  const target = chain.targetIndex;
  const through = state.computedThrough;
  const parts = [];

  for (let p = 0; p <= target; p += 1) {
    if (p > 0) {
      parts.push(`<span class="wots-rail-arrow" aria-hidden="true">→</span>`);
    }

    const reached = through >= p;
    const isFocus = state.focusPos === p;
    const isSig =
      p === target && (state.revealedSig || state.collected || state.mode === "select");
    const pending = state.mode === "hash" && !reached;
    const selectMark = state.mode === "select" && p === target;

    let role = "pending";
    let hash = "······";
    let cls = "is-pending";

    if (state.mode === "select") {
      if (p === target) {
        role = "selected";
        hash = "target";
        cls = "is-target";
      } else {
        role = "—";
        hash = "·";
        cls = "is-ghost";
      }
    } else if (reached) {
      if (p === 0) {
        role = "secret";
        hash = bytesToHex(chain.nodes[0]).slice(0, 6);
        cls = "is-secret";
      } else if (p === target && state.revealedSig) {
        role = state.collected ? "in σ" : "signature";
        hash = bytesToHex(chain.nodes[p]).slice(0, 6);
        cls = "is-sig";
      } else if (p <= target) {
        // Still secret until published into σ — including the target tip.
        role = "secret";
        hash = bytesToHex(chain.nodes[p]).slice(0, 6);
        cls = p === target ? "is-secret is-target" : "is-secret";
      }
    } else if (pending && p === target) {
      role = "target";
      hash = "······";
      cls = "is-target is-pending";
    }

    if (isFocus) {
      cls += " is-focus";
    }
    if (selectMark) {
      cls += " is-focus";
    }

    const ellip = /^[0-9a-f]{6}$/i.test(hash) ? "…" : "";
    parts.push(`
      <div class="wots-rail-step ${cls}" title="position ${p}">
        <span class="wots-rail-pos">${p}</span>
        <span class="wots-rail-hash">${escapeHtml(hash)}${ellip}</span>
        <span class="wots-rail-role">${role}</span>
      </div>`);
  }

  if (target < 15) {
    parts.push(`<span class="wots-rail-gap" aria-hidden="true">⋯</span>`);
    parts.push(`
      <div class="wots-rail-step is-public" title="public endpoint">
        <span class="wots-rail-pos">15</span>
        <span class="wots-rail-hash">${escapeHtml(chain.endpointShort)}…</span>
        <span class="wots-rail-role">public</span>
      </div>`);
  } else {
    // target == 15: last rail step is both signature candidate and public tip
    // restyle the last step we already pushed if it's the public endpoint case
  }

  return `
    <div class="wots-focus-card wots-focus-card--rail">
      <div class="wots-focus-head">
        <strong>Chain ${chain.chainIndex}</strong>
        <span class="wots-muted">target ${target} · ${chain.group}</span>
        <span class="wots-pill">pk ${escapeHtml(chain.endpointShort)}</span>
      </div>
      <div class="wots-hash-rail" role="list">${parts.join("")}</div>
    </div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
