/**
 * WOTS key-reuse helpers: componentwise min leak + forgeability checks.
 * All values come from real signing traces (same seeds/chains as honest signing).
 */

import { bytesToHex } from "./bytes.js";
import { WOTS_TW } from "./wots-tw.js";

/**
 * Per-chain leak height after seeing two signatures.
 * @param {number[]} indexesA
 * @param {number[]} indexesB
 */
export function leakFloor(indexesA, indexesB) {
  if (indexesA.length !== indexesB.length) {
    throw new Error("index vectors must match length");
  }
  return indexesA.map((d, i) => Math.min(d, indexesB[i]));
}

/**
 * A message is forgeable iff every digit (incl. checksum) is ≥ the leak floor.
 * @param {number[]} indexes
 * @param {number[]} floor
 */
export function isForgeable(indexes, floor) {
  if (indexes.length !== floor.length) {
    return false;
  }
  return indexes.every((d, i) => d >= floor[i]);
}

/**
 * Build a completed-signature view-model for renderOverview.
 * @param {Awaited<ReturnType<import("./wots-tw.js").signWotsTw>>} trace
 */
export function viewForSignedTrace(trace) {
  return {
    selected: trace.chains.map(() => true),
    signatureCollected: trace.chains.map(() => true),
    chainState: trace.chains.map((c) => ({
      computedThrough: c.targetIndex,
      revealedSig: true,
      focusPos: null,
    })),
  };
}

/**
 * Clone chains with a new target height (leak frontier or forged digits).
 * Node material comes from an honest trace with the same key.
 * @param {Awaited<ReturnType<import("./wots-tw.js").signWotsTw>>} trace
 * @param {number[]} targets
 */
export function chainsAtTargets(trace, targets) {
  if (targets.length !== WOTS_TW.totalChains) {
    throw new Error(`expected ${WOTS_TW.totalChains} targets`);
  }
  return trace.chains.map((chain, i) => {
    const targetIndex = targets[i];
    const signatureElement = new Uint8Array(chain.nodes[targetIndex]);
    return {
      ...chain,
      targetIndex,
      signatureElement,
      signatureShort: bytesToHex(signatureElement).slice(0, 6),
    };
  });
}

/**
 * @param {Awaited<ReturnType<import("./wots-tw.js").signWotsTw>>} trace
 * @param {number[]} targets
 */
export function viewForTargets(trace, targets) {
  const chains = chainsAtTargets(trace, targets);
  return {
    chains,
    view: {
      selected: targets.map(() => true),
      signatureCollected: targets.map(() => true),
      chainState: targets.map((t) => ({
        computedThrough: t,
        revealedSig: true,
        focusPos: null,
      })),
    },
  };
}

/**
 * Leak frontier + publicly hashable band from floor → pk tip.
 * Positions below the floor stay unknown (observer cannot go backward).
 * @param {Awaited<ReturnType<import("./wots-tw.js").signWotsTw>>} trace
 * @param {number[]} floor
 */
export function viewForPublicHashZone(trace, floor) {
  const chains = chainsAtTargets(trace, floor);
  return {
    chains,
    view: {
      selected: floor.map(() => false),
      signatureCollected: floor.map(() => false),
      chainState: floor.map((f) => ({
        computedThrough: -1,
        revealedSig: false,
        focusPos: null,
        publicFrom: f,
      })),
    },
  };
}

/**
 * Forged signature sitting inside the public-hash band.
 * Leak floor stays marked; forged digit is the signature node.
 * @param {Awaited<ReturnType<import("./wots-tw.js").signWotsTw>>} trace
 * @param {number[]} floor
 * @param {number[]} forgedIndexes
 */
export function viewForForgedInZone(trace, floor, forgedIndexes) {
  const chains = chainsAtTargets(trace, forgedIndexes);
  return {
    chains,
    view: {
      selected: forgedIndexes.map(() => true),
      signatureCollected: forgedIndexes.map(() => true),
      chainState: forgedIndexes.map((t, i) => ({
        computedThrough: -1,
        revealedSig: true,
        focusPos: t,
        publicFrom: floor[i],
      })),
    },
  };
}
