/**
 * SHRINCS FORS (Forest of Random Subsets) with configurable toy params for viz.
 * Algorithms match SHRINCS.md / FIPS-205 FORS; demo uses small k and a.
 */

import { base2b, bytesToHex, concatBytes, ceildiv } from "../../wots/crypto/bytes.js";
import { F, H, PRF, T_k, NODE_SIZE } from "../../wots/crypto/primitives.js";
import {
  makeForsPrfAddress,
  makeForsTreeAddress,
  makeForsRootsAddress,
} from "../../wots/crypto/address.js";

/** Visualization-friendly params (SHRINCS production uses k=10, a=13). */
export const FORS_DEMO = Object.freeze({
  k: 4,
  a: 3,
  n: NODE_SIZE,
  get leavesPerTree() {
    return 1 << this.a;
  },
  get digestBytes() {
    return ceildiv(this.k * this.a, 8);
  },
  get signatureBytes() {
    return this.n * this.k * (this.a + 1);
  },
});

/**
 * @param {number} tree
 * @param {number} leafInTree
 * @param {number} [a]
 */
export function forestLeafIndex(tree, leafInTree, a = FORS_DEMO.a) {
  return tree * (1 << a) + leafInTree;
}

/**
 * @param {number} tree
 * @param {number} nodeInTree
 * @param {number} height
 * @param {number} [a]
 */
export function forestNodeIndex(tree, nodeInTree, height, a = FORS_DEMO.a) {
  return tree * (1 << (a - height)) + nodeInTree;
}

/**
 * @param {object} params
 * @param {Uint8Array} params.skSeed
 * @param {Uint8Array} params.pkSeed
 * @param {number} [params.layer]
 * @param {number|bigint} [params.treeAddress]
 * @param {number} [params.keypairIndex]
 * @param {number} params.nodeIndex - forest-wide leaf index
 */
export async function forsSkGen({
  skSeed,
  pkSeed,
  layer = 0,
  treeAddress = 0,
  keypairIndex = 0,
  nodeIndex,
}) {
  const adrs = makeForsPrfAddress({
    layer,
    treeAddress,
    keypairIndex,
    nodeIndex,
  });
  return PRF(pkSeed, skSeed, adrs.bytes);
}

/**
 * Compute one FORS Merkle node (with full subtree material for visualization).
 * @returns {Promise<{ hash: Uint8Array, left?: object, right?: object, preimage?: Uint8Array }>}
 */
export async function forsNode({
  skSeed,
  pkSeed,
  layer = 0,
  treeAddress = 0,
  keypairIndex = 0,
  nodeIndex,
  nodeHeight,
}) {
  if (nodeHeight === 0) {
    const preimage = await forsSkGen({
      skSeed,
      pkSeed,
      layer,
      treeAddress,
      keypairIndex,
      nodeIndex,
    });
    const leafAdrs = makeForsTreeAddress({
      layer,
      treeAddress,
      keypairIndex,
      treeHeight: 0,
      treeIndex: nodeIndex,
    });
    const hash = await F(pkSeed, leafAdrs.bytes, preimage);
    return {
      hash,
      preimage,
      nodeIndex,
      nodeHeight,
      short: bytesToHex(hash).slice(0, 6),
      preimageShort: bytesToHex(preimage).slice(0, 6),
    };
  }

  const lchildIndex = 2 * nodeIndex;
  const childHeight = nodeHeight - 1;
  const left = await forsNode({
    skSeed,
    pkSeed,
    layer,
    treeAddress,
    keypairIndex,
    nodeIndex: lchildIndex,
    nodeHeight: childHeight,
  });
  const right = await forsNode({
    skSeed,
    pkSeed,
    layer,
    treeAddress,
    keypairIndex,
    nodeIndex: lchildIndex + 1,
    nodeHeight: childHeight,
  });
  const parentAdrs = makeForsTreeAddress({
    layer,
    treeAddress,
    keypairIndex,
    treeHeight: nodeHeight,
    treeIndex: nodeIndex,
  });
  const hash = await H(
    pkSeed,
    parentAdrs.bytes,
    concatBytes(left.hash, right.hash)
  );
  return {
    hash,
    left,
    right,
    nodeIndex,
    nodeHeight,
    short: bytesToHex(hash).slice(0, 6),
  };
}

/**
 * Flatten a forsNode tree into levels[height][indexInTree] → node.
 * @param {object} rootNode - forsNode result at height a for one tree
 * @param {number} a
 */
export function flattenTree(rootNode, a = FORS_DEMO.a) {
  /** @type {Array<Array<object|null>>} */
  const levels = Array.from({ length: a + 1 }, (_, h) =>
    new Array(1 << (a - h)).fill(null)
  );

  function walk(node) {
    if (!node) {
      return;
    }
    const h = node.nodeHeight;
    const width = 1 << (a - h);
    // nodeIndex is forest-wide; within-tree index = nodeIndex % width
    const local = node.nodeIndex % width;
    levels[h][local] = node;
    walk(node.left);
    walk(node.right);
  }

  walk(rootNode);
  return levels;
}

/**
 * Sign a FORS digest and retain full trees for the visualizer.
 */
export async function signFors({
  messageDigest,
  skSeed,
  pkSeed,
  layer = 0,
  treeAddress = 0,
  keypairIndex = 0,
  k = FORS_DEMO.k,
  a = FORS_DEMO.a,
}) {
  const digestBytes = ceildiv(k * a, 8);
  if (
    !(messageDigest instanceof Uint8Array) ||
    messageDigest.length !== digestBytes
  ) {
    throw new Error(`FORS digest must be ${digestBytes} bytes`);
  }

  const indexes = base2b(messageDigest, a, k);
  const trees = [];
  const signatureParts = [];

  for (let i = 0; i < k; i += 1) {
    const leafInTree = indexes[i];
    const forestLeaf = forestLeafIndex(i, leafInTree, a);
    const rootForestIndex = forestNodeIndex(i, 0, a, a);
    const rootNode = await forsNode({
      skSeed,
      pkSeed,
      layer,
      treeAddress,
      keypairIndex,
      nodeIndex: rootForestIndex,
      nodeHeight: a,
    });
    const levels = flattenTree(rootNode, a);
    const leafNode = levels[0][leafInTree];
    const authPath = [];
    for (let j = 0; j < a; j += 1) {
      const siblingLocal = (leafInTree >> j) ^ 1;
      const sibling = levels[j][siblingLocal];
      authPath.push({
        height: j,
        siblingLocal,
        node: sibling,
        short: sibling.short,
        hash: sibling.hash,
      });
    }

    trees.push({
      treeIndex: i,
      leafInTree,
      forestLeaf,
      levels,
      root: rootNode,
      rootShort: rootNode.short,
      leaf: leafNode,
      preimage: leafNode.preimage,
      preimageShort: leafNode.preimageShort,
      authPath,
    });

    signatureParts.push(leafNode.preimage);
    for (const step of authPath) {
      signatureParts.push(step.hash);
    }
  }

  const rootsConcat = concatBytes(...trees.map((t) => t.root.hash));
  const rootsAdrs = makeForsRootsAddress({
    layer,
    treeAddress,
    keypairIndex,
  });
  const publicKey = await T_k(pkSeed, rootsAdrs.bytes, rootsConcat);
  const signature = concatBytes(...signatureParts);

  // Verify path reconstitutes the same pk (sanity for the demo).
  const recovered = await forsPubkeyFromSig({
    signature,
    messageDigest,
    pkSeed,
    layer,
    treeAddress,
    keypairIndex,
    k,
    a,
  });

  return {
    scheme: "FORS",
    params: { k, a, digestBytes, leavesPerTree: 1 << a },
    inputs: {
      messageDigestHex: bytesToHex(messageDigest),
      pkSeedHex: bytesToHex(pkSeed),
      skSeedHex: bytesToHex(skSeed),
      layer,
      treeAddress: Number(treeAddress),
      keypairIndex,
    },
    indexes,
    trees,
    signature,
    signatureHex: bytesToHex(signature),
    publicKey,
    publicKeyShort: bytesToHex(publicKey).slice(0, 6),
    publicKeyHex: bytesToHex(publicKey),
    verified: bytesToHex(recovered) === bytesToHex(publicKey),
  };
}

/**
 * Recover FORS pk from signature (SHRINCS fors_pubkey_from_sig).
 */
export async function forsPubkeyFromSig({
  signature,
  messageDigest,
  pkSeed,
  layer = 0,
  treeAddress = 0,
  keypairIndex = 0,
  k = FORS_DEMO.k,
  a = FORS_DEMO.a,
}) {
  const indexes = base2b(messageDigest, a, k);
  let offset = 0;
  const roots = [];

  for (let i = 0; i < k; i += 1) {
    const preimage = signature.slice(offset, offset + NODE_SIZE);
    offset += NODE_SIZE;
    let treeIndex = forestLeafIndex(i, indexes[i], a);
    const leafAdrs = makeForsTreeAddress({
      layer,
      treeAddress,
      keypairIndex,
      treeHeight: 0,
      treeIndex,
    });
    let node = await F(pkSeed, leafAdrs.bytes, preimage);

    for (let j = 0; j < a; j += 1) {
      const sibling = signature.slice(offset, offset + NODE_SIZE);
      offset += NODE_SIZE;
      const parent = makeForsTreeAddress({
        layer,
        treeAddress,
        keypairIndex,
        treeHeight: j + 1,
        treeIndex: treeIndex >> 1,
      });
      if (((indexes[i] >> j) & 1) === 1) {
        node = await H(pkSeed, parent.bytes, concatBytes(sibling, node));
      } else {
        node = await H(pkSeed, parent.bytes, concatBytes(node, sibling));
      }
      treeIndex >>= 1;
    }
    roots.push(node);
  }

  const rootsAdrs = makeForsRootsAddress({
    layer,
    treeAddress,
    keypairIndex,
  });
  return T_k(pkSeed, rootsAdrs.bytes, concatBytes(...roots));
}
