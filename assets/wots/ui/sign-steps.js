/**
 * Flat step list for WOTS-TW signing animation (next/prev/play).
 *
 * Phases:
 *  1. Split message into log₂(w)=4-bit chunks (and read them as digits)
 *  2. Compute checksum digits from the message digits
 *  3. Select that location on each hash chain
 *  4. Hash sk forward; after each chain’s tip, place σᵢ into the signature
 *  5. End state — full signature assembled
 */

import { WOTS_TW } from "../crypto/wots-tw.js";
import { bytesToHex } from "../crypto/bytes.js";

/**
 * @typedef {{
 *   id: number,
 *   phase: 1|2|3|4|5,
 *   kind: string,
 *   label: string,
 *   detail?: string,
 *   chainIndex?: number,
 *   chunkIndex?: number,
 *   pos?: number,
 * }} SignStep
 */

/**
 * @param {Awaited<ReturnType<import("../crypto/wots-tw.js").signWotsTw>>} trace
 * @returns {SignStep[]}
 */
export function buildSignSteps(trace) {
  /** @type {SignStep[]} */
  const steps = [];
  let id = 0;
  const push = (step) => {
    steps.push({ id: id++, ...step });
  };

  const { mapping, chains } = trace;
  const msg = trace.inputs.messageHex;

  // —— Phase 1: split into 4-bit chunks (= digits) ——
  push({
    phase: 1,
    kind: "message",
    label: "Start from the 16-byte message",
    detail: `message = ${msg}`,
  });
  push({
    phase: 1,
    kind: "split-intro",
    label: "Split into log₂(w) = 4-bit chunks",
    detail: "w = 16, so each chunk is one hex nibble — the same value is the Winternitz digit 0…15.",
  });
  for (let i = 0; i < WOTS_TW.messageChains; i += 1) {
    push({
      phase: 1,
      kind: "chunk",
      label: `Chunk ${i}: 0x${mapping.nibbles[i]} → digit ${mapping.messageIndexes[i]}`,
      detail: `4-bit nibble = ${mapping.messageIndexes[i]} (0…15)`,
      chunkIndex: i,
    });
  }

  // —— Phase 2: checksum ——
  push({
    phase: 2,
    kind: "checksum-sum",
    label: `Add the 32 message digits → Σ = ${mapping.digitSum}`,
    detail: `Σ is the sum of the digit row above (each digit 0…15).`,
  });
  push({
    phase: 2,
    kind: "checksum-max",
    label: `Maximum possible sum = 32 × 15 = ${WOTS_TW.checksumMax}`,
    detail: `32 message digits, each at most 15 → ceiling ${WOTS_TW.checksumMax}. The checksum is measured down from this ceiling.`,
  });
  push({
    phase: 2,
    kind: "checksum-sub",
    label: `Checksum value = ${WOTS_TW.checksumMax} − Σ = ${mapping.checksum}`,
    detail: `${WOTS_TW.checksumMax} − ${mapping.digitSum} = ${mapping.checksum}. Smaller Σ ⇒ larger checksum (and the reverse).`,
  });
  push({
    phase: 2,
    kind: "checksum-encode",
    label: `Write ${mapping.checksum} as three base-16 digits: [${mapping.checksumIndexes.join(", ")}]`,
    detail: `${mapping.checksum} = 0x${mapping.checksumHex.toUpperCase()} → nibbles (>>8), (>>4), (&0xf) = ${mapping.checksumIndexes.map((d, i) => `${d} (0x${d.toString(16)})`).join(", ")}`,
  });
  for (let i = 0; i < WOTS_TW.checksumChains; i += 1) {
    const chainIndex = WOTS_TW.messageChains + i;
    const shift = [8, 4, 0][i];
    push({
      phase: 2,
      kind: "checksum-digit",
      label: `Checksum digit ${i} = (${mapping.checksum} >> ${shift}) & 0xf = ${mapping.checksumIndexes[i]}`,
      detail: `This becomes the selected position on checksum chain ${chainIndex}`,
      chunkIndex: chainIndex,
      chainIndex,
    });
  }

  // —— Phase 3: select locations on chains ——
  push({
    phase: 3,
    kind: "select-intro",
    label: "Each digit picks a height on its hash chain",
    detail: "Position 0 is sk; position 15 is the public endpoint.",
  });
  for (let i = 0; i < WOTS_TW.totalChains; i += 1) {
    push({
      phase: 3,
      kind: "select",
      label: `Chain ${i}: select position ${chains[i].targetIndex}`,
      detail:
        i < WOTS_TW.messageChains
          ? `message digit ${i} → pos ${chains[i].targetIndex}`
          : `checksum digit ${i - WOTS_TW.messageChains} → pos ${chains[i].targetIndex}`,
      chainIndex: i,
      pos: chains[i].targetIndex,
    });
  }

  // —— Phase 4: hash each chain, then slot σᵢ into the signature ——
  push({
    phase: 4,
    kind: "hash-intro",
    label: "Signer hashes sk forward to each selected node",
    detail:
      "After each chain reaches its tip, the next step places that node into σ. Earlier nodes stay secret.",
  });
  for (let c = 0; c < WOTS_TW.totalChains; c += 1) {
    const chain = chains[c];
    const target = chain.targetIndex;
    push({
      phase: 4,
      kind: "chain-start",
      label: `Chain ${c}: start from secret ${bytesToHex(chain.nodes[0]).slice(0, 6)}…`,
      detail: `PRF-derived secret for chain ${c} (unique per chain). Will apply F exactly ${target} time(s)`,
      chainIndex: c,
      pos: 0,
    });
    for (let p = 1; p <= target; p += 1) {
      push({
        phase: 4,
        kind: "hash",
        label: `Chain ${c}: F → position ${p}`,
        detail: `h${p} = F(pk_seed, ADRS, h${p - 1})`,
        chainIndex: c,
        pos: p,
      });
    }
    push({
      phase: 4,
      kind: "reveal-sig",
      label: `Chain ${c}: reached position ${target}`,
      detail: `Published node ${chain.signatureShort}… — next places it into σ_${c}`,
      chainIndex: c,
      pos: target,
    });
    push({
      phase: 4,
      kind: "sig-collect",
      label: `Place σ_${c} into the signature (${chain.signatureShort}…)`,
      detail: `chain ${c}, position ${target}`,
      chainIndex: c,
      pos: target,
    });
  }

  // —— Phase 5: end state only ——
  push({
    phase: 5,
    kind: "done",
    label: "Signature complete",
    detail: `σ = σ₀ ‖ … ‖ σ₃₄ (${trace.counters.signatureBytes} bytes). Public tips stay public; each σᵢ is one revealed chain node.`,
  });

  return steps;
}

/**
 * Derive the UI view-model for a given step index.
 * @param {Awaited<ReturnType<import("../crypto/wots-tw.js").signWotsTw>>} trace
 * @param {SignStep[]} steps
 * @param {number} stepIndex
 */
export function viewModelAt(trace, steps, stepIndex) {
  const idx = Math.max(0, Math.min(stepIndex, steps.length - 1));
  const current = steps[idx];
  const phase = current.phase;

  const chunksRevealed = new Array(WOTS_TW.messageChains).fill(false);
  const digitsRevealed = new Array(WOTS_TW.messageChains).fill(false);
  let checksumSumShown = false;
  let checksumMaxShown = false;
  let checksumValueShown = false;
  let checksumEncoded = false;
  const checksumDigitsRevealed = new Array(WOTS_TW.checksumChains).fill(false);
  const selected = new Array(WOTS_TW.totalChains).fill(false);

  /** @type {Array<{ computedThrough: number, revealedSig: boolean, focusPos: number|null }>} */
  const chainState = trace.chains.map(() => ({
    computedThrough: -1, // -1 = nothing shown yet (not even sk)
    revealedSig: false,
    focusPos: null,
  }));

  const signatureCollected = new Array(WOTS_TW.totalChains).fill(false);
  let signatureDone = false;

  for (let i = 0; i <= idx; i += 1) {
    const s = steps[i];
    switch (s.kind) {
      case "chunk":
        chunksRevealed[s.chunkIndex] = true;
        digitsRevealed[s.chunkIndex] = true;
        break;
      case "digit":
        digitsRevealed[s.chunkIndex] = true;
        break;
      case "checksum-sum":
        checksumSumShown = true;
        break;
      case "checksum-max":
        checksumSumShown = true;
        checksumMaxShown = true;
        break;
      case "checksum-sub":
        checksumSumShown = true;
        checksumMaxShown = true;
        checksumValueShown = true;
        break;
      case "checksum-encode":
        checksumSumShown = true;
        checksumMaxShown = true;
        checksumValueShown = true;
        checksumEncoded = true;
        break;
      case "checksum-digit":
        checksumSumShown = true;
        checksumMaxShown = true;
        checksumValueShown = true;
        checksumEncoded = true;
        checksumDigitsRevealed[s.chunkIndex - WOTS_TW.messageChains] = true;
        break;
      case "select":
        selected[s.chainIndex] = true;
        break;
      case "chain-start":
        chainState[s.chainIndex].computedThrough = 0;
        chainState[s.chainIndex].focusPos = 0;
        break;
      case "hash":
        chainState[s.chainIndex].computedThrough = s.pos;
        chainState[s.chainIndex].focusPos = s.pos;
        break;
      case "reveal-sig":
        chainState[s.chainIndex].computedThrough = Math.max(
          chainState[s.chainIndex].computedThrough,
          s.pos
        );
        chainState[s.chainIndex].revealedSig = true;
        chainState[s.chainIndex].focusPos = s.pos;
        break;
      case "sig-collect":
        chainState[s.chainIndex].computedThrough = Math.max(
          chainState[s.chainIndex].computedThrough,
          s.pos ?? 0
        );
        chainState[s.chainIndex].revealedSig = true;
        chainState[s.chainIndex].focusPos = s.pos ?? null;
        signatureCollected[s.chainIndex] = true;
        break;
      case "done":
        signatureDone = true;
        for (let c = 0; c < WOTS_TW.totalChains; c += 1) {
          signatureCollected[c] = true;
          chainState[c].revealedSig = true;
          chainState[c].computedThrough = Math.max(
            chainState[c].computedThrough,
            trace.chains[c].targetIndex
          );
        }
        break;
      default:
        break;
    }
  }

  // Clear focus on chains that aren't the current step's chain
  if (typeof current.chainIndex === "number") {
    for (let c = 0; c < WOTS_TW.totalChains; c += 1) {
      if (c !== current.chainIndex) {
        chainState[c].focusPos = null;
      }
    }
  } else {
    for (let c = 0; c < WOTS_TW.totalChains; c += 1) {
      chainState[c].focusPos = null;
    }
  }

  return {
    stepIndex: idx,
    step: current,
    phase,
    totalSteps: steps.length,
    chunksRevealed,
    digitsRevealed,
    checksumSumShown,
    checksumMaxShown,
    checksumValueShown,
    checksumEncoded,
    checksumDigitsRevealed,
    selected,
    chainState,
    signatureCollected,
    signatureDone,
    mapping: trace.mapping,
    chains: trace.chains,
    signatureHex: trace.signatureHex,
  };
}

export const PHASE_TITLES = {
  1: "Split message into 4-bit chunks",
  2: "Compute checksum",
  3: "Select positions on hash chains",
  4: "Hash chains & fill signature slots",
  5: "Signature complete",
};

export const PHASE_COUNT = 5;
