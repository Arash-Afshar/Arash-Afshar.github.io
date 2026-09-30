/**
 * Traceable WOTS hash-chain iteration.
 * Ports wots_tw_chain_iter / wots_c_chain_iter from impl/shrincs.py.
 *
 * Architecture: compute → validate → produce execution trace.
 * The returned nodes are the only values the UI may display.
 */

import { bytesToHex } from "./bytes.js";
import { Address, ADRS_TYPES } from "./address.js";
import { F, NODE_SIZE, CHAIN_MAX } from "./primitives.js";

/**
 * @typedef {"WOTS-TW" | "WOTS+C"} ChainScheme
 */

/**
 * Iterate a WOTS chain from `start` by `steps`, recording every F call.
 *
 * @param {object} params
 * @param {Uint8Array} params.node - 16-byte starting node
 * @param {number} params.start - hash index of `node`
 * @param {number} params.steps - number of F applications
 * @param {Uint8Array} params.pkSeed - 16-byte public seed
 * @param {Address} params.address - ADRS with keypair/chain (and SF location) set
 * @param {ChainScheme} params.scheme
 * @returns {Promise<{
 *   node: Uint8Array,
 *   endIndex: number,
 *   steps: Array<{
 *     hashIndex: number,
 *     input: Uint8Array,
 *     output: Uint8Array,
 *     addressHex: string,
 *     addressBytes: Uint8Array
 *   }>,
 *   counters: { sha256Calls: number, chainHashCalls: number }
 * }>}
 */
export async function chainIter({
  node,
  start,
  steps,
  pkSeed,
  address,
  scheme,
}) {
  if (!(node instanceof Uint8Array) || node.length !== NODE_SIZE) {
    throw new Error("chain node must be 16 bytes");
  }
  if (!Number.isInteger(start) || start < 0 || start > CHAIN_MAX) {
    throw new Error(`start out of range: ${start}`);
  }
  if (!Number.isInteger(steps) || steps < 0) {
    throw new Error(`steps out of range: ${steps}`);
  }
  if (start + steps > CHAIN_MAX) {
    throw new Error(
      `start + steps exceeds chain end: ${start} + ${steps} > ${CHAIN_MAX}`
    );
  }

  const hashType =
    scheme === "WOTS+C" ? ADRS_TYPES.SF_WOTS_C_HASH : ADRS_TYPES.SL_WOTS_TW_HASH;

  const adrs = address.clone();
  adrs.setType(hashType);

  const recorded = [];
  let current = node;

  for (let j = start; j < start + steps; j += 1) {
    adrs.setHashIndex(j);
    const input = current;
    const addressBytes = new Uint8Array(adrs.bytes);
    const output = await F(pkSeed, addressBytes, input);
    recorded.push({
      hashIndex: j,
      input: new Uint8Array(input),
      output: new Uint8Array(output),
      addressHex: bytesToHex(addressBytes),
      addressBytes,
    });
    current = output;
  }

  return {
    node: new Uint8Array(current),
    endIndex: start + steps,
    steps: recorded,
    counters: {
      sha256Calls: recorded.length,
      chainHashCalls: recorded.length,
    },
  };
}

/**
 * Build the full chain 0..15 from a secret (position 0), returning every node
 * and the per-step trace. Secret itself is position 0 (not produced by F).
 */
export async function buildFullChain({ secret, pkSeed, address, scheme }) {
  if (!(secret instanceof Uint8Array) || secret.length !== NODE_SIZE) {
    throw new Error("secret must be 16 bytes");
  }

  const result = await chainIter({
    node: secret,
    start: 0,
    steps: CHAIN_MAX,
    pkSeed,
    address,
    scheme,
  });

  const nodes = new Array(CHAIN_MAX + 1);
  nodes[0] = new Uint8Array(secret);
  for (let i = 0; i < result.steps.length; i += 1) {
    nodes[i + 1] = new Uint8Array(result.steps[i].output);
  }

  return {
    scheme,
    nodes,
    steps: result.steps,
    endpoint: nodes[CHAIN_MAX],
    counters: result.counters,
    addressBaseHex: address.toHex(),
  };
}
