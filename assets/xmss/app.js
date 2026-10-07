/**
 * XMSS signing visualizer (SHRINCS WOTS-TW leaves + Merkle tree, toy height).
 * Chrome matches the WOTS / FORS demos (shared wots-*.css classes).
 */

import { hexToBytes, bytesToHex } from "../wots/crypto/bytes.js";
import { sha256 } from "../wots/crypto/sha256.js";
import { XMSS_DEMO, buildXmssTree, signXmss } from "./crypto/xmss.js";
import { renderXmssNarration } from "./ui/render-signing.js";
import { renderXmssTree } from "./ui/render-tree.js";
import { buildXmssSteps, viewModelAt, PHASE_COUNT } from "./ui/sign-steps.js";

const DEMO = {
  pkSeed: "000102030405060708090a0b0c0d0e0f",
  skSeed: "101112131415161718191a1b1c1d1e1f",
  layer: 0,
  treeAddress: 0,
  defaultMessage: "A Sample Message to Sign",
  defaultLeaf: 2,
};

function byId(id) {
  return document.getElementById(id);
}

function setStatus(el, text, kind) {
  el.textContent = text;
  el.dataset.kind = kind || "";
}

function leafOptionsHtml(selected) {
  return Array.from({ length: XMSS_DEMO.leaves }, (_, i) => {
    const sel = i === selected ? " selected" : "";
    return `<option value="${i}"${sel}>${i}</option>`;
  }).join("");
}

function ensureDemoShell(root) {
  root.classList.add("wots-demo", "xmss-demo");
  if (byId("overview-root") && byId("msg-input") && byId("btn-sign")) {
    return;
  }

  root.innerHTML = `
    <div class="wots-panel">
      <div id="xmss-message-anchor" class="wots-message-anchor">
        <div class="wots-message-form">
          <label class="wots-field">
            <span>Message</span>
            <input id="msg-input" type="text" spellcheck="false"
              placeholder="Any text (hashed to 16 bytes), or 32 hex chars"
              value="${DEMO.defaultMessage}">
          </label>
          <label class="wots-field xmss-idx-field">
            <span>Leaf idx</span>
            <select id="leaf-input">${leafOptionsHtml(DEMO.defaultLeaf)}</select>
          </label>
          <button type="button" id="btn-sign">Sign</button>
          <button type="button" id="btn-example">Example</button>
        </div>
        <p class="wots-note" id="msg-hint">
          Text → SHA-256 truncated to 16 bytes. Leaf index is the stateful counter (0…${XMSS_DEMO.leaves - 1}).
        </p>
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
      <div id="overview-root" class="demo-overview-slot demo-overview-slot--xmss"></div>
    </div>

    <div class="wots-panel">
      <h2 class="section-title demo-key-title">Key material</h2>
      <p class="wots-note">
        Fixed demo seeds (same as the WOTS posts). Leaves are real SHRINCS WOTS-TW public keys
        compressed with <code>T_sl</code>; parents use tweakable <code>H</code>.
      </p>
      <dl id="seed-info"></dl>
    </div>
  `;
}

async function parseMessage(raw) {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === 32) {
    return hexToBytes(trimmed);
  }
  if (trimmed.length === 0) {
    throw new Error("message is empty");
  }
  const digest = await sha256(new TextEncoder().encode(trimmed));
  return digest.slice(0, 16);
}

async function main() {
  const mount = byId("xmss-demo") || document.querySelector(".xmss-demo");
  if (!mount) {
    return;
  }
  ensureDemoShell(mount);

  const status = byId("status");
  const narrationRoot = byId("narration-root");
  const overviewRoot = byId("overview-root");
  const msgInput = byId("msg-input");
  const leafInput = byId("leaf-input");
  const btnSign = byId("btn-sign");
  const btnExample = byId("btn-example");
  const btnPrev = byId("btn-prev");
  const btnNext = byId("btn-next");
  const btnPrevPhase = byId("btn-prev-phase");
  const btnNextPhase = byId("btn-next-phase");
  const btnPlay = byId("btn-play");
  const btnPause = byId("btn-pause");
  const btnReset = byId("btn-reset");
  const speedInput = byId("speed");

  byId("seed-info").innerHTML = `
    <dt>pk_seed</dt><dd><code>${DEMO.pkSeed}</code></dd>
    <dt>sk_seed</dt><dd><code>${DEMO.skSeed}</code></dd>
    <dt>layer / tree</dt><dd><code>${DEMO.layer}</code> / <code>${DEMO.treeAddress}</code></dd>
    <dt>demo params</dt><dd>h=${XMSS_DEMO.h}, leaves=${XMSS_DEMO.leaves}</dd>
  `;

  let treeCache = null;
  let treePromise = null;
  let trace = null;
  let steps = [];
  let stepIndex = 0;
  let playing = false;
  let playTimer = null;

  async function ensureTree() {
    if (treeCache) {
      return treeCache;
    }
    if (!treePromise) {
      treePromise = buildXmssTree({
        pkSeed: hexToBytes(DEMO.pkSeed),
        skSeed: hexToBytes(DEMO.skSeed),
        layer: DEMO.layer,
        treeAddress: DEMO.treeAddress,
        h: XMSS_DEMO.h,
      }).then((tree) => {
        treeCache = tree;
        return tree;
      });
    }
    return treePromise;
  }

  function stopPlay() {
    playing = false;
    if (playTimer !== null) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    btnPause.disabled = true;
    btnPlay.disabled = !trace || stepIndex >= steps.length - 1;
  }

  function paintIdle() {
    narrationRoot.innerHTML = `
      <p class="wots-note">Press <strong>Sign</strong> to build the XMSS tree, spend one WOTS leaf, and climb the authentication path.</p>
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

  function setStep(index) {
    if (!trace) {
      return;
    }
    stepIndex = Math.max(0, Math.min(index, steps.length - 1));
    const view = viewModelAt(trace, steps, stepIndex);
    renderXmssNarration(narrationRoot, view, trace, {
      onPhase: (phase) => jumpToPhase(phase, { at: "end" }),
    });
    renderXmssTree(overviewRoot, { trace, view });

    btnPrev.disabled = stepIndex <= 0;
    btnNext.disabled = stepIndex >= steps.length - 1;
    btnPrevPhase.disabled = steps[stepIndex].phase <= 1;
    btnNextPhase.disabled = steps[stepIndex].phase >= PHASE_COUNT;
    btnReset.disabled = false;
    btnPlay.disabled = playing || stepIndex >= steps.length - 1;
    btnPause.disabled = !playing;
  }

  function jumpToPhase(phase, { at = "start" } = {}) {
    if (!trace || phase < 1 || phase > PHASE_COUNT) {
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
    jumpToPhase(target, { at: delta < 0 ? "end" : "start" });
  }

  function togglePlayPause() {
    if (playing) {
      stopPlay();
      setStatus(status, "Paused.", "ok");
      return;
    }
    if (!trace || stepIndex >= steps.length - 1) {
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
      const ms = Math.max(40, Number(speedInput.value) || 160);
      playTimer = setTimeout(tick, ms);
    };
    tick();
  }

  async function doSign({ scrollToMessage = false } = {}) {
    stopPlay();
    btnSign.disabled = true;
    setStatus(status, "Building XMSS tree (8× WOTS-TW leaves)…", "busy");
    try {
      const message = await parseMessage(msgInput.value);
      const leafIndex = Number(leafInput.value);
      if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= XMSS_DEMO.leaves) {
        throw new Error(`leaf index must be 0…${XMSS_DEMO.leaves - 1}`);
      }

      byId("msg-hint").textContent =
        /^[0-9a-fA-F]+$/.test(msgInput.value.trim()) &&
        msgInput.value.trim().length === 32
          ? `Using hex message ${bytesToHex(message)}; leaf ${leafIndex}`
          : `Using SHA-256(text)[:16] = ${bytesToHex(message)}; leaf ${leafIndex}`;

      const tree = await ensureTree();
      setStatus(status, `Signing under leaf ${leafIndex}…`, "busy");

      trace = await signXmss({
        message,
        leafIndex,
        pkSeed: hexToBytes(DEMO.pkSeed),
        skSeed: hexToBytes(DEMO.skSeed),
        layer: DEMO.layer,
        treeAddress: DEMO.treeAddress,
        h: XMSS_DEMO.h,
        tree,
      });
      if (!trace.verified) {
        throw new Error("internal verify failed");
      }
      steps = buildXmssSteps(trace);
      stepIndex = 0;
      setStep(0);
      setStatus(
        status,
        `Signed — σ = ${trace.signature.length} bytes, XMSS pk ${trace.publicKeyShort}…`,
        "ok"
      );
      if (scrollToMessage) {
        const anchor = byId("xmss-message-anchor");
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
    leafInput.value = String(DEMO.defaultLeaf);
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
  btnPause.addEventListener("click", () => {
    stopPlay();
    setStatus(status, "Paused.", "ok");
  });
  btnPlay.addEventListener("click", () => {
    togglePlayPause();
  });

  window.addEventListener("keydown", (event) => {
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
      if (!trace || steps[stepIndex].phase >= PHASE_COUNT) {
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
