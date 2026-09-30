/**
 * WOTS-TW message mapping and signing with full execution traces.
 * Renderer must only display values produced here.
 */

import { base2b, bytesToHex, concatBytes } from "./bytes.js";
import { Address, ADRS_TYPES, makeStatelessWotsAddress } from "./address.js";
import { PRF, NODE_SIZE, CHAIN_MAX, CHAIN_LENGTH } from "./primitives.js";
import { buildFullChain } from "./chain.js";

export const WOTS_TW = Object.freeze({
  n: NODE_SIZE,
  w: 16,
  logW: 4,
  messageChains: 32,
  checksumChains: 3,
  totalChains: 35,
  chainLength: CHAIN_LENGTH,
  chainMax: CHAIN_MAX,
  /** max digit sum = 32 * 15 = 480 */
  checksumMax: 480,
});

/**
 * Map a 16-byte message to 32 message digits + 3 checksum digits.
 * @param {Uint8Array} message16
 */
export function mapMessageWotsTw(message16) {
  if (!(message16 instanceof Uint8Array) || message16.length !== NODE_SIZE) {
    throw new Error("WOTS-TW message must be 16 bytes");
  }

  const messageIndexes = base2b(message16, WOTS_TW.logW, WOTS_TW.messageChains);
  const sum = messageIndexes.reduce((a, b) => a + b, 0);
  const checksum = WOTS_TW.checksumMax - sum;
  if (checksum < 0 || checksum > 0xfff) {
    throw new Error(`checksum out of 3-nibble range: ${checksum}`);
  }
  const checksumIndexes = [
    (checksum >> 8) & 0xf,
    (checksum >> 4) & 0xf,
    checksum & 0xf,
  ];
  const finalIndexes = [...messageIndexes, ...checksumIndexes];

  return {
    messageIndexes,
    checksum,
    checksumIndexes,
    finalIndexes,
    nibbles: messageIndexes.map((d) => d.toString(16)),
  };
}

/**
 * Sign with WOTS-TW: derive each chain secret, hash to the target digit,
 * record public endpoints and a full per-step trace.
 *
 * @param {object} params
 * @param {Uint8Array} params.message - 16-byte message
 * @param {Uint8Array} params.pkSeed
 * @param {Uint8Array} params.skSeed
 * @param {number} [params.layer]
 * @param {number|bigint} [params.treeAddress]
 * @param {number} [params.keypairIndex]
 */
export async function signWotsTw({
  message,
  pkSeed,
  skSeed,
  layer = 0,
  treeAddress = 0,
  keypairIndex = 0,
}) {
  const mapping = mapMessageWotsTw(message);
  const chains = [];
  let sha256Calls = 0;
  let prfCalls = 0;
  let chainHashCalls = 0;

  for (let chainIndex = 0; chainIndex < WOTS_TW.totalChains; chainIndex += 1) {
    const targetIndex = mapping.finalIndexes[chainIndex];
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

    // Full chain for public endpoint (PK tip) + animation material.
    // Signing steps are the prefix of this walk (0 → targetIndex).
    const full = await buildFullChain({
      secret,
      pkSeed,
      address,
      scheme: "WOTS-TW",
    });
    sha256Calls += full.counters.sha256Calls;
    chainHashCalls += full.counters.chainHashCalls;

    const signingSteps = full.steps.slice(0, targetIndex).map((step) => ({
      hashIndex: step.hashIndex,
      input: new Uint8Array(step.input),
      output: new Uint8Array(step.output),
      addressHex: step.addressHex,
      addressBytes: new Uint8Array(step.addressBytes),
    }));

    const signatureElement = new Uint8Array(full.nodes[targetIndex]);

    chains.push({
      chainIndex,
      group: chainIndex < WOTS_TW.messageChains ? "message" : "checksum",
      targetIndex,
      secret: new Uint8Array(secret),
      nodes: full.nodes.map((n) => new Uint8Array(n)),
      signingSteps,
      signatureElement,
      endpoint: new Uint8Array(full.endpoint),
      endpointShort: bytesToHex(full.endpoint).slice(0, 6),
      signatureShort: bytesToHex(signatureElement).slice(0, 6),
    });
  }

  const signature = concatBytes(...chains.map((c) => c.signatureElement));

  return {
    scheme: "WOTS-TW",
    inputs: {
      messageHex: bytesToHex(message),
      pkSeedHex: bytesToHex(pkSeed),
      skSeedHex: bytesToHex(skSeed),
      layer,
      treeAddress: Number(treeAddress),
      keypairIndex,
    },
    mapping,
    chains,
    signature,
    signatureHex: bytesToHex(signature),
    counters: {
      sha256Calls,
      prfCalls,
      chainHashCalls,
      signatureBytes: signature.length,
    },
  };
}

/**
 * Short commit-style prefix (first 6 hex chars).
 * @param {Uint8Array|string} value
 */
export function shortHash(value) {
  const hex = typeof value === "string" ? value : bytesToHex(value);
  return hex.slice(0, 6);
}
