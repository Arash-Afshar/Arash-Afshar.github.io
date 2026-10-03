/**
 * WOTS-TW signing visualizer: message → digits → chains → signature,
 * with next/prev phase steps driven by a real execution trace.
 */

import { hexToBytes, bytesToHex } from "./crypto/bytes.js";
import { sha256 } from "./crypto/sha256.js";
import { signWotsTw, WOTS_TW } from "./crypto/wots-tw.js";
import { renderOverview } from "./ui/render-overview.js";
import { renderSignNarration } from "./ui/render-signing.js";
import { buildSignSteps, viewModelAt } from "./ui/sign-steps.js";

const DEMO = {
  pkSeed: "000102030405060708090a0b0c0d0e0f",
  skSeed: "101112131415161718191a1b1c1d1e1f",
  keypairIndex: 7,
  defaultMessage: "A Sample Message to Sign",
};

function byId(id) {
  return document.getElementById(id);
}

function setStatus(el, text, kind) {
  el.textContent = text;
  el.dataset.kind = kind || "";
}

function ensureDemoShell(root) {
  root.classList.add("wots-demo");
  // Prefer the prerendered shell (reserves layout height and avoids CLS).
  if (byId("overview-root") && byId("msg-input") && byId("btn-sign")) {
    return;
  }

  root.innerHTML = `
    <div class="wots-panel">
      <div id="wots-message-anchor" class="wots-message-anchor">
        <div class="wots-message-form">
          <label class="wots-field">
            <span>Message</span>
            <input id="msg-input" type="text" spellcheck="false"
              placeholder="Any text (hashed to 16 bytes), or 32 hex chars"
              value="${DEMO.defaultMessage}">
          </label>
          <button type="button" id="btn-sign">Sign</button>
          <button type="button" id="btn-example">Example</button>
        </div>
        <p class="wots-note" id="msg-hint">Enter 32 hex chars, or text — text is SHA-256 truncated to 16 bytes.</p>
      </div>
      <div class="wots-controls">
        <button type="button" id="btn-prev-phase" disabled>⟵ Phase</button>
        <button type="button" id="btn-prev" disabled>Prev</button>
        <button type="button" id="btn-next" disabled>Next</button>
        <button type="button" id="btn-next-phase" disabled>Phase ⟶</button>
        <button type="button" id="btn-play" disabled>Play</button>
        <button type="button" id="btn-pause" disabled>Pause</button>
        <button type="button" id="btn-reset" disabled>Reset</button>
        <label>
          Step ms
          <input id="speed" type="number" min="40" max="2000" step="20" value="160">
        </label>
      </div>
      <p id="status"></p>
      <p class="wots-note wots-shortcuts">Keys: <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step · <kbd>P</kbd>/<kbd>N</kbd> phase</p>
      <div id="narration-root" class="demo-narration-slot"></div>
      <div id="overview-root" class="demo-overview-slot"></div>
    </div>

    <div class="wots-panel">
      <h2 class="section-title demo-key-title">Key material</h2>
      <p class="wots-note">Fixed demo seeds. Each chain has its own PRF-derived secret (shown as a short prefix in the grid). Intermediates stay secret except as the animation reveals them; public tips are the green endpoints.</p>
      <dl id="seed-info"></dl>
    </div>
  `;
}

/**
 * Parse message field → 16 bytes.
 * Hex (32 chars) used as-is; otherwise SHA-256(text)[:16].
 * @param {string} raw
 */
async function parseMessage(raw) {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{32}$/.test(trimmed)) {
    return hexToBytes(trimmed);
  }
  if (trimmed.length === 0) {
    throw new Error("message is empty");
  }
  const digest = await sha256(new TextEncoder().encode(trimmed));
  return digest.slice(0, WOTS_TW.n);
}

async function main() {
  const mount = byId("wots-demo") || document.querySelector(".wots-demo");
  if (!mount) {
    return;
  }

  ensureDemoShell(mount);

  const overviewRoot = byId("overview-root");
  const narrationRoot = byId("narration-root");
  const status = byId("status");
  const msgInput = byId("msg-input");
  const speedInput = byId("speed");

  const btnSign = byId("btn-sign");
  const btnExample = byId("btn-example");
  const btnPrev = byId("btn-prev");
  const btnNext = byId("btn-next");
  const btnPrevPhase = byId("btn-prev-phase");
  const btnNextPhase = byId("btn-next-phase");
  const btnPlay = byId("btn-play");
  const btnPause = byId("btn-pause");
  const btnReset = byId("btn-reset");

  /** @type {null | Awaited<ReturnType<typeof signWotsTw>>} */
  let trace = null;
  /** @type {ReturnType<typeof buildSignSteps>} */
  let steps = [];
  let stepIndex = 0;
  let selectedChain = 0;
  let playing = false;
  let playTimer = null;

  byId("seed-info").innerHTML = `
    <dt>pk_seed</dt><dd><code>${DEMO.pkSeed}</code></dd>
    <dt>sk_seed</dt><dd><code>${DEMO.skSeed}</code></dd>
    <dt>keypair index</dt><dd><code>${DEMO.keypairIndex}</code></dd>
    <dt>params</dt><dd>n=${WOTS_TW.n}, w=${WOTS_TW.w}, chains=${WOTS_TW.totalChains}, len=${WOTS_TW.chainLength}</dd>
  `;

  function stopPlay() {
    playing = false;
    if (playTimer !== null) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    btnPause.disabled = true;
    btnPlay.disabled = !trace || stepIndex >= steps.length - 1;
  }

  function setStep(index) {
    if (!trace) {
      return;
    }
    stepIndex = Math.max(0, Math.min(index, steps.length - 1));
    const view = viewModelAt(trace, steps, stepIndex);
    if (typeof view.step.chainIndex === "number") {
      selectedChain = view.step.chainIndex;
    }
    renderSignNarration(narrationRoot, view, trace, {
      onPhase: (phase) => jumpToPhase(phase, { at: "end" }),
    });
    renderOverview(overviewRoot, {
      chains: trace.chains,
      view,
      selectedChain,
      onSelect: (chainIndex) => {
        selectedChain = chainIndex;
        const latest = viewModelAt(trace, steps, stepIndex);
        renderSignNarration(narrationRoot, latest, trace, {
          onPhase: (phase) => jumpToPhase(phase, { at: "end" }),
        });
        renderOverview(overviewRoot, {
          chains: trace.chains,
          view: latest,
          selectedChain,
          onSelect: null,
        });
        overviewRoot.querySelector(".wots-overview")._onSelect = (c) => {
          selectedChain = c;
          setStep(stepIndex);
        };
      },
    });

    btnPrev.disabled = stepIndex <= 0;
    btnNext.disabled = stepIndex >= steps.length - 1;
    btnPrevPhase.disabled = steps[stepIndex].phase <= 1;
    btnNextPhase.disabled = steps[stepIndex].phase >= 5;
    btnReset.disabled = false;
    btnPlay.disabled = playing || stepIndex >= steps.length - 1;
    btnPause.disabled = !playing;
  }

  function jumpToPhase(phase, { at = "start" } = {}) {
    if (!trace || phase < 1 || phase > 5) {
      return;
    }
    let idx = -1;
    if (at === "end") {
      for (let i = steps.length - 1; i >= 0; i -= 1) {
        if (steps[i].phase === phase) {
          idx = i;
          break;
        }
      }
    } else {
      idx = steps.findIndex((s) => s.phase === phase);
    }
    if (idx >= 0) {
      stopPlay();
      setStep(idx);
    }
  }

  function jumpPhase(delta) {
    if (!trace) {
      return;
    }
    const target = steps[stepIndex].phase + delta;
    // Forward: begin the next phase. Back: show the previous phase’s completed fill.
    jumpToPhase(target, { at: delta < 0 ? "end" : "start" });
  }

  function paintIdle() {
    narrationRoot.innerHTML = `
      <p class="wots-note">Press <strong>Sign</strong> to map the message onto 35 hash chains and step through the signature.</p>
    `;
    overviewRoot.innerHTML = "";
    btnPrev.disabled = true;
    btnNext.disabled = true;
    btnPrevPhase.disabled = true;
    btnNextPhase.disabled = true;
    btnPlay.disabled = true;
    btnPause.disabled = true;
    btnReset.disabled = true;
  }

  async function doSign({ scrollToMessage = false } = {}) {
    stopPlay();
    btnSign.disabled = true;
    setStatus(status, "Signing with real WOTS-TW (35 chains)…", "busy");
    try {
      const message = await parseMessage(msgInput.value);
      byId("msg-hint").textContent = /^[0-9a-fA-F]{32}$/.test(msgInput.value.trim())
        ? `Using hex message ${bytesToHex(message)}`
        : `Using SHA-256(text)[:16] = ${bytesToHex(message)}`;

      trace = await signWotsTw({
        message,
        pkSeed: hexToBytes(DEMO.pkSeed),
        skSeed: hexToBytes(DEMO.skSeed),
        keypairIndex: DEMO.keypairIndex,
      });
      steps = buildSignSteps(trace);
      stepIndex = 0;
      selectedChain = 0;
      setStep(0);
      setStatus(
        status,
        `Signed — ${trace.counters.prfCalls} PRF, ${trace.counters.chainHashCalls} chain hashes, σ = ${trace.counters.signatureBytes} bytes.`,
        "ok"
      );
      if (scrollToMessage) {
        const anchor = byId("wots-message-anchor");
        if (anchor) {
          requestAnimationFrame(() => {
            anchor.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      }
    } catch (error) {
      trace = null;
      steps = [];
      paintIdle();
      setStatus(status, `Sign failed: ${error.message}`, "error");
      console.error(error);
    }
    btnSign.disabled = false;
  }

  btnSign.addEventListener("click", () => {
    doSign({ scrollToMessage: true });
  });

  btnExample.addEventListener("click", () => {
    msgInput.value = DEMO.defaultMessage;
  });

  btnPrev.addEventListener("click", () => {
    stopPlay();
    setStep(stepIndex - 1);
  });

  btnNext.addEventListener("click", () => {
    stopPlay();
    setStep(stepIndex + 1);
  });

  btnPrevPhase.addEventListener("click", () => jumpPhase(-1));
  btnNextPhase.addEventListener("click", () => jumpPhase(1));

  btnReset.addEventListener("click", () => {
    stopPlay();
    setStep(0);
    setStatus(status, "Reset to phase 1.", "ok");
  });

  function startPlay() {
    if (!trace || playing || stepIndex >= steps.length - 1) {
      return;
    }
    playing = true;
    btnPlay.disabled = true;
    btnPause.disabled = false;
    setStatus(status, "Playing signing animation…", "busy");

    const tick = () => {
      if (!playing) {
        return;
      }
      if (stepIndex >= steps.length - 1) {
        stopPlay();
        setStatus(status, "Animation finished.", "ok");
        return;
      }
      setStep(stepIndex + 1);
      const speed = Number(speedInput.value) || 160;
      playTimer = setTimeout(tick, speed);
    };
    tick();
  }

  function pausePlay() {
    if (!playing) {
      return;
    }
    stopPlay();
    setStatus(status, "Paused.", "ok");
  }

  function togglePlayPause() {
    if (!trace) {
      return;
    }
    if (playing) {
      pausePlay();
    } else {
      startPlay();
    }
  }

  btnPlay.addEventListener("click", () => startPlay());
  btnPause.addEventListener("click", () => pausePlay());

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.closest("input, textarea, select, [contenteditable='true']") ||
        target.isContentEditable)
    ) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const key = event.key;
    if (key === " " || key === "Spacebar") {
      event.preventDefault();
      togglePlayPause();
      return;
    }
    if (key === "ArrowRight") {
      event.preventDefault();
      if (!trace || stepIndex >= steps.length - 1) {
        return;
      }
      stopPlay();
      setStep(stepIndex + 1);
      return;
    }
    if (key === "ArrowLeft") {
      event.preventDefault();
      if (!trace || stepIndex <= 0) {
        return;
      }
      stopPlay();
      setStep(stepIndex - 1);
      return;
    }
    if (key === "n" || key === "N") {
      event.preventDefault();
      if (!trace || steps[stepIndex].phase >= 5) {
        return;
      }
      jumpPhase(1);
      return;
    }
    if (key === "p" || key === "P") {
      event.preventDefault();
      if (!trace || steps[stepIndex].phase <= 1) {
        return;
      }
      jumpPhase(-1);
    }
  });

  paintIdle();
  setStatus(status, "Ready — enter a message and press Sign.", "ok");
  await doSign();
}

main();
