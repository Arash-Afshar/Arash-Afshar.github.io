/**
 * WOTS-TW signing visualizer: message → digits → chains → signature,
 * with next/prev phase steps driven by a real execution trace.
 */

import { hexToBytes, bytesToHex } from "./crypto/bytes.js";
import { sha256 } from "./crypto/sha256.js";
import { signWotsTw, WOTS_TW } from "./crypto/wots-tw.js";
import { runSelfTests } from "./crypto/self-tests.js";
import { renderOverview } from "./ui/render-overview.js";
import { renderSignNarration } from "./ui/render-signing.js";
import { buildSignSteps, viewModelAt } from "./ui/sign-steps.js";

const DEMO = {
  pkSeed: "000102030405060708090a0b0c0d0e0f",
  skSeed: "101112131415161718191a1b1c1d1e1f",
  keypairIndex: 7,
  defaultMessageHex: "0a1b2c3d4e5f60718293a4b5c6d7e8f9",
};

function byId(id) {
  return document.getElementById(id);
}

function setStatus(el, text, kind) {
  el.textContent = text;
  el.dataset.kind = kind || "";
}

function ensureDemoShell(root) {
  if (byId("overview-root")) {
    return;
  }

  root.classList.add("wots-demo");
  root.innerHTML = `
    <div class="wots-panel">
      <div class="wots-message-form">
        <label class="wots-field">
          <span>Message</span>
          <input id="msg-input" type="text" spellcheck="false"
            placeholder="16-byte hex, or any text (hashed to 16 bytes)"
            value="${DEMO.defaultMessageHex}">
        </label>
        <button type="button" id="btn-sign">Sign</button>
        <button type="button" id="btn-example" class="wots-btn-quiet">Example</button>
      </div>
      <p class="wots-note" id="msg-hint">Enter 32 hex chars, or text — text is SHA-256 truncated to 16 bytes.</p>
    </div>

    <div class="wots-panel">
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
        <button type="button" id="btn-tests">Run self-tests</button>
      </div>
      <p id="status"></p>
      <div id="narration-root"></div>
      <div id="overview-root"></div>
    </div>

    <div class="wots-panel">
      <h2 class="section-title" style="font-size:1.2rem;margin:0 0 0.7rem">Key material</h2>
      <p class="wots-note">Fixed demo seeds. Public chain tips (pk) are always visible; sk and intermediates stay secret except as the animation reveals them.</p>
      <dl id="seed-info" style="margin-top:0.8rem"></dl>
    </div>

    <div class="wots-panel">
      <h2 class="section-title" style="font-size:1.2rem;margin:0 0 0.7rem">Self-tests</h2>
      <div id="test-results"><p class="wots-note">Tests run automatically on load.</p></div>
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
  const testRoot = byId("test-results");
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
  const btnTests = byId("btn-tests");

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
      onPhase: (phase) => jumpToPhase(phase),
    });
    renderOverview(overviewRoot, {
      chains: trace.chains,
      view,
      selectedChain,
      onSelect: (chainIndex) => {
        selectedChain = chainIndex;
        const latest = viewModelAt(trace, steps, stepIndex);
        renderSignNarration(narrationRoot, latest, trace, {
          onPhase: (phase) => jumpToPhase(phase),
        });
        renderOverview(overviewRoot, {
          chains: trace.chains,
          view: latest,
          selectedChain,
          onSelect: null,
        });
        // restore handler without recursion loop
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

  function jumpToPhase(phase) {
    if (!trace || phase < 1 || phase > 5) {
      return;
    }
    const idx = steps.findIndex((s) => s.phase === phase);
    if (idx >= 0) {
      stopPlay();
      setStep(idx);
    }
  }

  function jumpPhase(delta) {
    if (!trace) {
      return;
    }
    jumpToPhase(steps[stepIndex].phase + delta);
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

  async function doSign() {
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
    doSign();
  });

  btnExample.addEventListener("click", () => {
    msgInput.value = DEMO.defaultMessageHex;
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

  btnPlay.addEventListener("click", () => {
    if (!trace || playing) {
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
  });

  btnPause.addEventListener("click", () => {
    stopPlay();
    setStatus(status, "Paused.", "ok");
  });

  async function runTests() {
    btnTests.disabled = true;
    testRoot.innerHTML = "<p>Running…</p>";
    try {
      const report = await runSelfTests();
      const items = report.results
        .map((r) => {
          const cls = r.ok ? "pass" : "fail";
          const detail = r.detail ? ` — ${escapeHtml(r.detail)}` : "";
          return `<li class="${cls}"><strong>${escapeHtml(r.name)}</strong>${detail}</li>`;
        })
        .join("");
      testRoot.innerHTML = `
        <p>${report.passed} passed, ${report.failed} failed</p>
        <ul class="test-list">${items}</ul>
      `;
      return report;
    } catch (error) {
      testRoot.innerHTML = `<p class="fail">${escapeHtml(error.message)}</p>`;
      throw error;
    } finally {
      btnTests.disabled = false;
    }
  }

  btnTests.addEventListener("click", async () => {
    setStatus(status, "Running self-tests…", "busy");
    try {
      const report = await runTests();
      setStatus(
        status,
        report.failed === 0
          ? "All self-tests passed."
          : `${report.failed} self-test(s) failed.`,
        report.failed === 0 ? "ok" : "error"
      );
    } catch (error) {
      setStatus(status, `Self-tests crashed: ${error.message}`, "error");
    }
  });

  paintIdle();
  setStatus(status, "Running self-tests…", "busy");
  try {
    const report = await runTests();
    if (report.failed !== 0) {
      setStatus(status, `${report.failed} self-test(s) failed.`, "error");
    }
  } catch (error) {
    setStatus(status, `Self-tests crashed: ${error.message}`, "error");
  }
  await doSign();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

main();
