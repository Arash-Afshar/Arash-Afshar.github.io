/**
 * Step list for XMSS signing animation.
 */

import { XMSS_DEMO } from "../crypto/xmss.js";

/**
 * @param {Awaited<ReturnType<import("../crypto/xmss.js").signXmss>>} trace
 */
export function buildXmssSteps(trace) {
  const { h } = trace.params;
  const idx = trace.leafIndex;
  const steps = [];
  let id = 0;
  const push = (step) => {
    steps.push({ id: id++, ...step });
  };

  push({
    phase: 1,
    kind: "tree-intro",
    label: `XMSS public key is a Merkle root over ${1 << h} WOTS keys`,
    detail: `Height h=${h}. Each leaf is T_sl of a WOTS-TW public key (35 chain tips). Interior nodes use tweakable H.`,
  });

  for (let i = 0; i < trace.tree.leafCount; i += 1) {
    push({
      phase: 1,
      kind: "leaf-pk",
      label: `Leaf ${i}: WOTS pk → ${trace.tree.levels[0][i].short}…`,
      detail: `keypair_index=${i}; compress tips with T_sl under a WOTS_PK address.`,
      leafShow: i,
    });
  }

  for (let height = 1; height <= h; height += 1) {
    const width = 1 << (h - height);
    for (let i = 0; i < width; i += 1) {
      const node = trace.tree.levels[height][i];
      push({
        phase: 1,
        kind: "parent",
        label:
          height === h
            ? `Root = H(children) → ${node.short}…`
            : `Height ${height}, node ${i} → ${node.short}…`,
        detail: `H(pk_seed, XMSS_TREE ADRS, left‖right)`,
        nodeHeight: height,
        nodeIndex: i,
      });
    }
  }

  push({
    phase: 1,
    kind: "pk-ready",
    label: `Publish XMSS pk ${trace.publicKeyShort}…`,
    detail: "Verifiers only store this root — not the 2ʰ WOTS public keys.",
  });

  push({
    phase: 2,
    kind: "pick-leaf",
    label: `Spend leaf index ${idx} (stateful!)`,
    detail: `Never reuse this index. After the signature, advance the counter past ${idx}.`,
    leafShow: idx,
  });

  push({
    phase: 2,
    kind: "wots-sign",
    label: `WOTS-TW signature under keypair ${idx}`,
    detail: `Same one-time scheme as the WOTS post: ${trace.params.wotsChains} chains, σ = ${trace.wots.signature.length} bytes. Checksum digits included.`,
    leafShow: idx,
  });

  push({
    phase: 2,
    kind: "wots-leaf",
    label: `Reconstructed leaf ${trace.leaf.short}… matches the tree`,
    detail: "Verifier hashes each signature node forward to the chain tips, then T_sl → leaf.",
    leafShow: idx,
  });

  push({
    phase: 3,
    kind: "auth-intro",
    label: `Collect the authentication path (${h} siblings)`,
    detail: "At each level, publish the sibling of the node on the path from the spent leaf to the root.",
    leafShow: idx,
  });

  for (let j = 0; j < h; j += 1) {
    const sib = trace.authPath[j];
    push({
      phase: 3,
      kind: "auth-sibling",
      label: `Auth height ${j}: sibling ${sib.short}…`,
      detail: `Sibling index ${sib.siblingIndex} on level ${j}`,
      leafShow: idx,
      pathHeight: j,
    });
  }

  push({
    phase: 4,
    kind: "verify-intro",
    label: "Verifier climbs leaf → root",
    detail: "Start from the WOTS-recovered leaf; hash with each auth sibling under XMSS_TREE addresses.",
    leafShow: idx,
  });

  for (let j = 1; j <= h; j += 1) {
    const node = trace.climb[j];
    push({
      phase: 4,
      kind: "verify-climb",
      label:
        j === h
          ? `Recomputed root ${node.short}…`
          : `Climb to height ${j} → ${node.short}…`,
      detail: j === h ? "Accept iff this equals the published XMSS public key." : "Continue with the next sibling.",
      leafShow: idx,
      climbHeight: j,
    });
  }

  push({
    phase: 4,
    kind: "done",
    label: trace.verified
      ? `Signature verifies — pk ${trace.publicKeyShort}…`
      : "Internal verify failed",
    detail: `σ = (idx ‖ WOTS σ ‖ auth) = ${trace.signature.length} bytes. Leaf ${idx} is now spent.`,
    leafShow: idx,
  });

  return steps;
}

/**
 * @param {Awaited<ReturnType<import("../crypto/xmss.js").signXmss>>} trace
 * @param {ReturnType<typeof buildXmssSteps>} steps
 * @param {number} stepIndex
 */
export function viewModelAt(trace, steps, stepIndex) {
  const idx = Math.max(0, Math.min(stepIndex, steps.length - 1));
  const current = steps[idx];
  const { h, leafCount } = trace.params;

  const leavesShown = new Array(leafCount).fill(false);
  /** @type {boolean[][]} */
  const nodesShown = Array.from({ length: h + 1 }, (_, height) =>
    new Array(1 << (h - height)).fill(false)
  );
  const authRevealed = new Array(h).fill(false);
  let pkShown = false;
  let wotsDone = false;
  let leafMatched = false;
  let climbHeight = -1;
  let done = false;
  let selectedLeaf = typeof current.leafShow === "number" ? current.leafShow : null;

  for (let i = 0; i <= idx; i += 1) {
    const s = steps[i];
    switch (s.kind) {
      case "leaf-pk":
        leavesShown[s.leafShow] = true;
        nodesShown[0][s.leafShow] = true;
        break;
      case "parent":
        nodesShown[s.nodeHeight][s.nodeIndex] = true;
        if (s.nodeHeight === h) {
          pkShown = true;
        }
        break;
      case "pk-ready":
        for (let li = 0; li < leafCount; li += 1) {
          leavesShown[li] = true;
          nodesShown[0][li] = true;
        }
        for (let height = 1; height <= h; height += 1) {
          nodesShown[height].fill(true);
        }
        pkShown = true;
        break;
      case "pick-leaf":
      case "wots-sign":
        selectedLeaf = s.leafShow;
        wotsDone = s.kind === "wots-sign" ? true : wotsDone;
        break;
      case "wots-leaf":
        selectedLeaf = s.leafShow;
        wotsDone = true;
        leafMatched = true;
        break;
      case "auth-sibling":
        selectedLeaf = s.leafShow;
        wotsDone = true;
        leafMatched = true;
        authRevealed[s.pathHeight] = true;
        break;
      case "auth-intro":
        selectedLeaf = s.leafShow;
        wotsDone = true;
        leafMatched = true;
        break;
      case "verify-intro":
        selectedLeaf = s.leafShow;
        wotsDone = true;
        leafMatched = true;
        authRevealed.fill(true);
        climbHeight = 0;
        break;
      case "verify-climb":
        selectedLeaf = s.leafShow;
        wotsDone = true;
        leafMatched = true;
        authRevealed.fill(true);
        climbHeight = s.climbHeight;
        break;
      case "done":
        selectedLeaf = s.leafShow;
        wotsDone = true;
        leafMatched = true;
        authRevealed.fill(true);
        climbHeight = h;
        pkShown = true;
        done = true;
        for (let li = 0; li < leafCount; li += 1) {
          leavesShown[li] = true;
          nodesShown[0][li] = true;
        }
        for (let height = 1; height <= h; height += 1) {
          nodesShown[height].fill(true);
        }
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
    leavesShown,
    nodesShown,
    authRevealed,
    pkShown,
    wotsDone,
    leafMatched,
    climbHeight,
    done,
    selectedLeaf,
    focusPathHeight:
      typeof current.pathHeight === "number" ? current.pathHeight : null,
    focusClimbHeight:
      typeof current.climbHeight === "number" ? current.climbHeight : null,
    focusNodeHeight:
      typeof current.nodeHeight === "number" ? current.nodeHeight : null,
    focusNodeIndex:
      typeof current.nodeIndex === "number" ? current.nodeIndex : null,
  };
}

export const PHASE_TITLES = {
  1: "Build Merkle tree → pk",
  2: "WOTS-sign one leaf",
  3: "Publish auth path",
  4: "Verify climb to root",
};

export const PHASE_COUNT = 4;

export { XMSS_DEMO };
