/**
 * Toy-height XMSS over real SHRINCS WOTS-TW leaves.
 * Algorithms match SPHINCS+/SHRINCS hypertree XMSS (T_sl leaves, H parents);
 * demo uses h=3 so every node fits on screen.
 */

import { bytesToHex, concatBytes, equalBytes } from "../../wots/crypto/bytes.js";
import {
  makeStatelessWotsAddress,
  makeWotsPkAddress,
  makeXmssTreeAddress,
  ADRS_TYPES,
} from "../../wots/crypto/address.js";
import { PRF, T_sl, H, NODE_SIZE, CHAIN_MAX } from "../../wots/crypto/primitives.js";
import { buildFullChain, chainIter } from "../../wots/crypto/chain.js";
import {
  WOTS_TW,
  mapMessageWotsTw,
  signWotsTw,
} from "../../wots/crypto/wots-tw.js";

/** Visualization-friendly height (production XMSS often uses h=10…20). */
export const XMSS_DEMO = Object.freeze({
  h: 3,
  n: NODE_SIZE,
  get leaves() {
    return 1 << this.h;
  },
});

/**
 * Compute one WOTS-TW public key (compressed leaf) with optional tip material.
 */
export async function wotsLeafPk({
  skSeed,
  pkSeed,
  layer = 0,
  treeAddress = 0,
  keypairIndex,
}) {
  const tips = [];
  let sha256Calls = 0;
  let prfCalls = 0;

  for (let chainIndex = 0; chainIndex < WOTS_TW.totalChains; chainIndex += 1) {
    const address = makeStatelessWotsAddress({
      layer,
      treeAddress,
      keypairIndex,
      chainIndex,
    });
    address.setType(ADRS_TYPES.SL_WOTS_TW_PRF);
    const secret = await PRF(pkSeed, skSeed, address.bytes);
    prfCalls += 1;
    sha256Calls += 1;

    const full = await buildFullChain({
      secret,
      pkSeed,
      address,
      scheme: "WOTS-TW",
    });
    sha256Calls += full.counters.sha256Calls;
    tips.push(full.endpoint);
  }

  const pkAdrs = makeWotsPkAddress({ layer, treeAddress, keypairIndex });
  const hash = await T_sl(pkSeed, pkAdrs.bytes, concatBytes(...tips));
  sha256Calls += 1;

  return {
    keypairIndex,
    hash,
    short: bytesToHex(hash).slice(0, 6),
    tips,
    counters: { sha256Calls, prfCalls },
  };
}

/**
 * Recover WOTS-TW public key from a signature (forward-hash to tips, then T_sl).
 */
export async function wotsPkFromSig({
  signature,
  message,
  pkSeed,
  layer = 0,
  treeAddress = 0,
  keypairIndex,
}) {
  if (!(signature instanceof Uint8Array) || signature.length !== WOTS_TW.totalChains * NODE_SIZE) {
    throw new Error(`WOTS-TW signature must be ${WOTS_TW.totalChains * NODE_SIZE} bytes`);
  }
  const mapping = mapMessageWotsTw(message);
  const tips = [];

  for (let chainIndex = 0; chainIndex < WOTS_TW.totalChains; chainIndex += 1) {
    const targetIndex = mapping.finalIndexes[chainIndex];
    const offset = chainIndex * NODE_SIZE;
    const startNode = signature.slice(offset, offset + NODE_SIZE);
    const address = makeStatelessWotsAddress({
      layer,
      treeAddress,
      keypairIndex,
      chainIndex,
    });
    const remaining = CHAIN_MAX - targetIndex;
    const walked = await chainIter({
      node: startNode,
      start: targetIndex,
      steps: remaining,
      pkSeed,
      address,
      scheme: "WOTS-TW",
    });
    tips.push(walked.node);
  }

  const pkAdrs = makeWotsPkAddress({ layer, treeAddress, keypairIndex });
  return T_sl(pkSeed, pkAdrs.bytes, concatBytes(...tips));
}

/**
 * Build a full XMSS Merkle tree of height h over WOTS-TW leaves.
 */
export async function buildXmssTree({
  skSeed,
  pkSeed,
  layer = 0,
  treeAddress = 0,
  h = XMSS_DEMO.h,
}) {
  const leafCount = 1 << h;
  /** @type {Array<Array<{ hash: Uint8Array, short: string, nodeIndex: number, nodeHeight: number, keypairIndex?: number }>>} */
  const levels = Array.from({ length: h + 1 }, (_, height) =>
    new Array(1 << (h - height)).fill(null)
  );

  let sha256Calls = 0;
  let prfCalls = 0;

  for (let i = 0; i < leafCount; i += 1) {
    const leaf = await wotsLeafPk({
      skSeed,
      pkSeed,
      layer,
      treeAddress,
      keypairIndex: i,
    });
    sha256Calls += leaf.counters.sha256Calls;
    prfCalls += leaf.counters.prfCalls;
    levels[0][i] = {
      hash: leaf.hash,
      short: leaf.short,
      nodeIndex: i,
      nodeHeight: 0,
      keypairIndex: i,
    };
  }

  for (let height = 1; height <= h; height += 1) {
    const width = 1 << (h - height);
    for (let i = 0; i < width; i += 1) {
      const left = levels[height - 1][2 * i];
      const right = levels[height - 1][2 * i + 1];
      const adrs = makeXmssTreeAddress({
        layer,
        treeAddress,
        treeHeight: height,
        treeIndex: i,
      });
      const hash = await H(pkSeed, adrs.bytes, concatBytes(left.hash, right.hash));
      sha256Calls += 1;
      levels[height][i] = {
        hash,
        short: bytesToHex(hash).slice(0, 6),
        nodeIndex: i,
        nodeHeight: height,
      };
    }
  }

  const root = levels[h][0];
  return {
    h,
    leafCount,
    levels,
    root,
    rootShort: root.short,
    publicKey: root.hash,
    publicKeyHex: bytesToHex(root.hash),
    publicKeyShort: root.short,
    counters: { sha256Calls, prfCalls },
    inputs: {
      pkSeedHex: bytesToHex(pkSeed),
      skSeedHex: bytesToHex(skSeed),
      layer,
      treeAddress: Number(treeAddress),
    },
  };
}

/**
 * Authentication path for leaf `idx`: sibling at each height 0..h-1.
 */
export function authPathForLeaf(tree, idx) {
  const { h, levels } = tree;
  if (!Number.isInteger(idx) || idx < 0 || idx >= tree.leafCount) {
    throw new Error(`leaf index out of range: ${idx}`);
  }
  const path = [];
  let nodeIndex = idx;
  for (let height = 0; height < h; height += 1) {
    const siblingIndex = nodeIndex ^ 1;
    const sibling = levels[height][siblingIndex];
    path.push({
      height,
      siblingIndex,
      node: sibling,
      short: sibling.short,
      hash: sibling.hash,
    });
    nodeIndex >>= 1;
  }
  return path;
}

/**
 * Climb from a leaf hash with an auth path to the root.
 */
export async function climbAuthPath({
  leafHash,
  leafIndex,
  authPath,
  pkSeed,
  layer = 0,
  treeAddress = 0,
}) {
  let node = leafHash;
  let idx = leafIndex;
  const climb = [{ height: 0, hash: leafHash, short: bytesToHex(leafHash).slice(0, 6) }];

  for (let j = 0; j < authPath.length; j += 1) {
    const sibling = authPath[j].hash;
    const parentAdrs = makeXmssTreeAddress({
      layer,
      treeAddress,
      treeHeight: j + 1,
      treeIndex: idx >> 1,
    });
    if ((idx & 1) === 1) {
      node = await H(pkSeed, parentAdrs.bytes, concatBytes(sibling, node));
    } else {
      node = await H(pkSeed, parentAdrs.bytes, concatBytes(node, sibling));
    }
    idx >>= 1;
    climb.push({
      height: j + 1,
      hash: node,
      short: bytesToHex(node).slice(0, 6),
    });
  }
  return { root: node, climb };
}

/**
 * Sign a 16-byte message under one unused XMSS leaf.
 */
export async function signXmss({
  message,
  leafIndex,
  skSeed,
  pkSeed,
  layer = 0,
  treeAddress = 0,
  h = XMSS_DEMO.h,
  tree = null,
}) {
  if (!(message instanceof Uint8Array) || message.length !== NODE_SIZE) {
    throw new Error("XMSS demo message must be 16 bytes");
  }
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= 1 << h) {
    throw new Error(`leaf index must be in 0…${(1 << h) - 1}`);
  }

  const built =
    tree ||
    (await buildXmssTree({
      skSeed,
      pkSeed,
      layer,
      treeAddress,
      h,
    }));

  const wots = await signWotsTw({
    message,
    pkSeed,
    skSeed,
    layer,
    treeAddress,
    keypairIndex: leafIndex,
  });

  const authPath = authPathForLeaf(built, leafIndex);
  const leafNode = built.levels[0][leafIndex];

  const recoveredLeaf = await wotsPkFromSig({
    signature: wots.signature,
    message,
    pkSeed,
    layer,
    treeAddress,
    keypairIndex: leafIndex,
  });
  const leafOk = equalBytes(recoveredLeaf, leafNode.hash);

  const { root: recoveredRoot, climb } = await climbAuthPath({
    leafHash: recoveredLeaf,
    leafIndex,
    authPath,
    pkSeed,
    layer,
    treeAddress,
  });
  const verified = leafOk && equalBytes(recoveredRoot, built.publicKey);

  const authBytes = concatBytes(...authPath.map((s) => s.hash));
  // Wire layout (demo): idx (1 byte for toy h) ‖ WOTS σ ‖ auth path
  const idxByte = new Uint8Array([leafIndex & 0xff]);
  const signature = concatBytes(idxByte, wots.signature, authBytes);

  return {
    scheme: "XMSS-demo",
    params: {
      h,
      leafCount: built.leafCount,
      wotsChains: WOTS_TW.totalChains,
    },
    inputs: {
      messageHex: bytesToHex(message),
      pkSeedHex: bytesToHex(pkSeed),
      skSeedHex: bytesToHex(skSeed),
      layer,
      treeAddress: Number(treeAddress),
      leafIndex,
    },
    tree: built,
    leafIndex,
    leaf: leafNode,
    wots,
    authPath,
    climb,
    signature,
    signatureHex: bytesToHex(signature),
    publicKey: built.publicKey,
    publicKeyHex: built.publicKeyHex,
    publicKeyShort: built.publicKeyShort,
    verified,
    leafOk,
  };
}
