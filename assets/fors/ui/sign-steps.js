/**
 * Step list for FORS signing animation.
 */

import { FORS_DEMO } from "../crypto/fors.js";

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
/**
 * @param {Awaited<ReturnType<import("../crypto/fors.js").signFors>>} trace
 */
export function buildForsSteps(trace) {
  const { k, a } = trace.params;
  const steps = [];
  let id = 0;
  const push = (step) => {
    steps.push({ id: id++, ...step });
  };

  push({
    phase: 1,
    kind: "message",
    label: "Start from a message digest",
    detail: `digest ${formatDigestWithBits(trace.inputs.messageDigestHex, a)} (${trace.params.digestBytes} bytes; base_2b uses the first k·a = ${k * a} bits)`,
  });
  push({
    phase: 1,
    kind: "split-intro",
    label: `Split the digest into ${k} indexes of ${a} bits each`,
    detail: "base_2b(digest, a, k) — one leaf selector per Merkle tree in the forest.",
  });
  for (let i = 0; i < k; i += 1) {
    push({
      phase: 1,
      kind: "index",
      label: `Tree ${i}: select leaf ${trace.indexes[i]}`,
      detail: `index_${i} ∈ {0…${(1 << a) - 1}} = ${trace.indexes[i]}`,
      treeIndex: i,
    });
  }

  push({
    phase: 2,
    kind: "forest-intro",
    label: `Reveal one secret leaf in each of ${k} trees`,
    detail: "Each leaf preimage is PRF(pk_seed, sk_seed, FORS_PRF address). The leaf hash is F(pk_seed, ADRS, preimage).",
  });

  for (let i = 0; i < k; i += 1) {
    const tree = trace.trees[i];
    push({
      phase: 2,
      kind: "reveal-sk",
      label: `Tree ${i}: reveal secret ${tree.preimageShort}…`,
      detail: `PRF at forest leaf index ${tree.forestLeaf}`,
      treeIndex: i,
    });
    push({
      phase: 2,
      kind: "leaf-hash",
      label: `Tree ${i}: leaf = F(preimage) → ${tree.leaf.short}…`,
      detail: "Tweakable F under a FORS_TREE address at height 0.",
      treeIndex: i,
    });
  }

  push({
    phase: 3,
    kind: "auth-intro",
    label: "Collect Merkle authentication paths",
    detail: `For each tree, publish ${a} sibling hashes so the verifier can climb to the root.`,
  });

  for (let i = 0; i < k; i += 1) {
    const tree = trace.trees[i];
    for (let j = 0; j < a; j += 1) {
      const sib = tree.authPath[j];
      push({
        phase: 3,
        kind: "auth-sibling",
        label: `Tree ${i}: auth path height ${j} → sibling ${sib.short}…`,
        detail: `Sibling at local index ${sib.siblingLocal} on level ${j}`,
        treeIndex: i,
        pathHeight: j,
      });
    }
    push({
      phase: 3,
      kind: "root-ready",
      label: `Tree ${i}: root ${tree.rootShort}… is now recoverable`,
      detail: "Verifier hashes leaf ‖ siblings with H up to the root.",
      treeIndex: i,
    });
  }

  push({
    phase: 4,
    kind: "pk-intro",
    label: "Compress all tree roots into the FORS public key",
    detail: `T_k(pk_seed, FORS_ROOTS, root₀‖…‖rootₖ₋₁)`,
  });
  push({
    phase: 4,
    kind: "done",
    label: `FORS signature complete — pk ${trace.publicKeyShort}…`,
    detail: `σ = (preimage ‖ auth_path) × ${k} trees = ${trace.signature.length} bytes. Same SHRINCS primitives as production; this demo uses a toy forest (k=${k}, a=${a}) so the trees fit on screen.`,
  });

  return steps;
}

/**
 * @param {Awaited<ReturnType<import("../crypto/fors.js").signFors>>} trace
 * @param {ReturnType<typeof buildForsSteps>} steps
 * @param {number} stepIndex
 */
export function viewModelAt(trace, steps, stepIndex) {
  const idx = Math.max(0, Math.min(stepIndex, steps.length - 1));
  const current = steps[idx];
  const { k, a } = trace.params;

  const indexesRevealed = new Array(k).fill(false);
  const skRevealed = new Array(k).fill(false);
  const leafRevealed = new Array(k).fill(false);
  const authRevealed = Array.from({ length: k }, () => new Array(a).fill(false));
  const rootReady = new Array(k).fill(false);
  let pkShown = false;
  let done = false;

  for (let i = 0; i <= idx; i += 1) {
    const s = steps[i];
    switch (s.kind) {
      case "index":
        indexesRevealed[s.treeIndex] = true;
        break;
      case "reveal-sk":
        indexesRevealed[s.treeIndex] = true;
        skRevealed[s.treeIndex] = true;
        break;
      case "leaf-hash":
        indexesRevealed[s.treeIndex] = true;
        skRevealed[s.treeIndex] = true;
        leafRevealed[s.treeIndex] = true;
        break;
      case "auth-sibling":
        indexesRevealed[s.treeIndex] = true;
        skRevealed[s.treeIndex] = true;
        leafRevealed[s.treeIndex] = true;
        authRevealed[s.treeIndex][s.pathHeight] = true;
        break;
      case "root-ready":
        indexesRevealed[s.treeIndex] = true;
        skRevealed[s.treeIndex] = true;
        leafRevealed[s.treeIndex] = true;
        authRevealed[s.treeIndex].fill(true);
        rootReady[s.treeIndex] = true;
        break;
      case "done":
        indexesRevealed.fill(true);
        skRevealed.fill(true);
        leafRevealed.fill(true);
        for (let t = 0; t < k; t += 1) {
          authRevealed[t].fill(true);
          rootReady[t] = true;
        }
        pkShown = true;
        done = true;
        break;
      default:
        break;
    }
  }

  return {
    stepIndex: idx,
    step: current,
    phase: current.phase,
    totalSteps: steps.length,
    indexesRevealed,
    skRevealed,
    leafRevealed,
    authRevealed,
    rootReady,
    pkShown,
    done,
    focusTree:
      typeof current.treeIndex === "number" ? current.treeIndex : null,
    focusPathHeight:
      typeof current.pathHeight === "number" ? current.pathHeight : null,
  };
}

export const PHASE_TITLES = {
  1: "Map digest → leaf indexes",
  2: "Reveal selected secrets",
  3: "Publish Merkle auth paths",
  4: "Compress roots → FORS pk",
};

export const PHASE_COUNT = 4;
