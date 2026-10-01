/**
 * SHRINCS 22-byte compressed ADRS.
 * Layout matches SHRINCS.md / impl/shrincs.py.
 *
 * Stateless: layer(1) | tree_address(8) | type(1) | payload(12)
 * Stateful:  node_height(1) | node_index(8) | type(1) | payload(12)
 *
 * Payload interpretation depends on type (see ADRS_TYPES).
 */

import { zeros, u32be, u64be, bytesToHex, equalBytes } from "./bytes.js";

export const ADRS_SIZE = 22;

export const ADRS_TYPES = Object.freeze({
  SL_WOTS_TW_HASH: 0,
  SL_WOTS_TW_PK: 1,
  SL_XMSS_TREE: 2,
  SL_FORS_TREE: 3,
  SL_FORS_ROOTS: 4,
  SL_WOTS_TW_PRF: 5,
  SL_FORS_PRF: 6,
  SF_WOTS_C_HASH: 16,
  SF_WOTS_C_PK: 17,
  SF_FXMSS_TREE: 18,
  SF_WOTS_C_PRF: 21,
  SF_WOTS_C_GRIND: 22,
});

export class Address {
  constructor(bytes) {
    if (bytes) {
      if (!(bytes instanceof Uint8Array) || bytes.length !== ADRS_SIZE) {
        throw new Error("ADRS must be exactly 22 bytes");
      }
      this.bytes = new Uint8Array(bytes);
    } else {
      this.bytes = zeros(ADRS_SIZE);
    }
  }

  clone() {
    return new Address(this.bytes);
  }

  toHex() {
    return bytesToHex(this.bytes);
  }

  equals(other) {
    return equalBytes(this.bytes, other.bytes);
  }

  // --- common leading fields ---

  setLayer(layer) {
    this.bytes[0] = layer & 0xff;
    return this;
  }

  getLayer() {
    return this.bytes[0];
  }

  setTreeAddress(treeAddress) {
    this.bytes.set(u64be(treeAddress), 1);
    return this;
  }

  getTreeAddress() {
    let n = 0n;
    for (let i = 1; i < 9; i += 1) {
      n = (n << 8n) | BigInt(this.bytes[i]);
    }
    return n;
  }

  setNodeHeight(height) {
    this.bytes[0] = height & 0xff;
    return this;
  }

  getNodeHeight() {
    return this.bytes[0];
  }

  setNodeIndex(index) {
    this.bytes.set(u64be(index), 1);
    return this;
  }

  getNodeIndex() {
    return this.getTreeAddress();
  }

  setType(type) {
    this.bytes[9] = type & 0xff;
    return this;
  }

  getType() {
    return this.bytes[9];
  }

  // --- payload helpers (bytes 10..21) ---

  setKeypairIndex(index) {
    this.bytes.set(u32be(index), 10);
    return this;
  }

  getKeypairIndex() {
    return readU32(this.bytes, 10);
  }

  setChainIndex(index) {
    this.bytes.set(u32be(index), 14);
    return this;
  }

  getChainIndex() {
    return readU32(this.bytes, 14);
  }

  setHashIndex(index) {
    this.bytes.set(u32be(index), 18);
    return this;
  }

  getHashIndex() {
    return readU32(this.bytes, 18);
  }

  /** Clear payload bytes 10..21. */
  clearPayload() {
    this.bytes.fill(0, 10, 22);
    return this;
  }

  /** Clear bytes 14..21 (chain + hash), keep keypair / structure. */
  clearChainAndHash() {
    this.bytes.fill(0, 14, 22);
    return this;
  }

  /** Clear bytes 10..13 (used before WOTS+C chain iteration after PRF). */
  clearBytes10to13() {
    this.bytes.fill(0, 10, 14);
    return this;
  }

  setTreeStructure(structureBytes) {
    if (!(structureBytes instanceof Uint8Array) || structureBytes.length !== 2) {
      throw new Error("tree structure must be 2 bytes");
    }
    this.bytes.set(structureBytes, 10);
    return this;
  }

  getTreeStructure() {
    return this.bytes.slice(10, 12);
  }
}

function readU32(bytes, offset) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/**
 * Build a blank stateless WOTS-TW address with keypair and chain set.
 */
export function makeStatelessWotsAddress({
  layer = 0,
  treeAddress = 0,
  keypairIndex = 0,
  chainIndex = 0,
} = {}) {
  return new Address()
    .setLayer(layer)
    .setTreeAddress(treeAddress)
    .setKeypairIndex(keypairIndex)
    .setChainIndex(chainIndex)
    .setHashIndex(0);
}

/**
 * FORS PRF address: type SL_FORS_PRF, word1=keypair, word3=forest-wide leaf index.
 */
export function makeForsPrfAddress({
  layer = 0,
  treeAddress = 0,
  keypairIndex = 0,
  nodeIndex = 0,
} = {}) {
  return new Address()
    .setLayer(layer)
    .setTreeAddress(treeAddress)
    .setType(ADRS_TYPES.SL_FORS_PRF)
    .setKeypairIndex(keypairIndex)
    .setHashIndex(nodeIndex);
}

/**
 * FORS Merkle-tree hash address: type SL_FORS_TREE.
 * word1=keypair, word2=tree_height, word3=forest-wide tree_index.
 */
export function makeForsTreeAddress({
  layer = 0,
  treeAddress = 0,
  keypairIndex = 0,
  treeHeight = 0,
  treeIndex = 0,
} = {}) {
  return new Address()
    .setLayer(layer)
    .setTreeAddress(treeAddress)
    .setType(ADRS_TYPES.SL_FORS_TREE)
    .setKeypairIndex(keypairIndex)
    .setChainIndex(treeHeight)
    .setHashIndex(treeIndex);
}

/**
 * FORS roots compression address: type SL_FORS_ROOTS, word1=keypair.
 */
export function makeForsRootsAddress({
  layer = 0,
  treeAddress = 0,
  keypairIndex = 0,
} = {}) {
  return new Address()
    .setLayer(layer)
    .setTreeAddress(treeAddress)
    .setType(ADRS_TYPES.SL_FORS_ROOTS)
    .setKeypairIndex(keypairIndex);
}

/**
 * Build a blank stateful WOTS+C address with node location and chain set.
 */
export function makeStatefulWotsAddress({
  nodeHeight = 0,
  nodeIndex = 0,
  chainIndex = 0,
  treeStructure = new Uint8Array([0, 0]),
} = {}) {
  return new Address()
    .setNodeHeight(nodeHeight)
    .setNodeIndex(nodeIndex)
    .setTreeStructure(treeStructure)
    .setChainIndex(chainIndex)
    .setHashIndex(0);
}
