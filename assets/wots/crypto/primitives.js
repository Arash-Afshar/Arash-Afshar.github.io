/**
 * SHRINCS WOTS-related SHA-256 primitives.
 * Exact ports of impl/shrincs.py: F, PRF, T_sl, T_sf, H_grind.
 *
 * All outputs are truncated to 16 bytes (n = 16).
 */

import { concatBytes, zeros, u16be } from "./bytes.js";
import { sha256 } from "./sha256.js";
import { ADRS_SIZE } from "./address.js";

const N = 16;
const PK_SEED_PAD = 48;

function assertPkSeed(pkSeed) {
  if (!(pkSeed instanceof Uint8Array) || pkSeed.length !== N) {
    throw new Error("pk_seed must be 16 bytes");
  }
}

function assertAdrs(adrsBytes) {
  if (!(adrsBytes instanceof Uint8Array) || adrsBytes.length !== ADRS_SIZE) {
    throw new Error("ADRS must be 22 bytes");
  }
}

async function tweaked16(pkSeed, adrsBytes, message) {
  assertPkSeed(pkSeed);
  assertAdrs(adrsBytes);
  const digest = await sha256(
    concatBytes(pkSeed, zeros(PK_SEED_PAD), adrsBytes, message)
  );
  return digest.slice(0, N);
}

/**
 * F(pk_seed, ADRS, M_1) — single 16-byte chain step / FORS leaf hash.
 */
export async function F(pkSeed, adrsBytes, m1) {
  if (!(m1 instanceof Uint8Array) || m1.length !== N) {
    throw new Error("F message must be 16 bytes");
  }
  return tweaked16(pkSeed, adrsBytes, m1);
}

/**
 * PRF(pk_seed, sk_seed, ADRS) — secret preimage derivation.
 */
export async function PRF(pkSeed, skSeed, adrsBytes) {
  if (!(skSeed instanceof Uint8Array) || skSeed.length !== N) {
    throw new Error("sk_seed must be 16 bytes");
  }
  return tweaked16(pkSeed, adrsBytes, skSeed);
}

/**
 * T_sl(pk_seed, ADRS, M_l) — compress WOTS-TW chain tips (35 * 16 bytes).
 */
export async function T_sl(pkSeed, adrsBytes, ml) {
  if (!(ml instanceof Uint8Array) || ml.length !== 35 * N) {
    throw new Error("T_sl message must be 560 bytes");
  }
  return tweaked16(pkSeed, adrsBytes, ml);
}

/**
 * T_sf(pk_seed, ADRS, M_l) — compress WOTS+C chain tips (32 * 16 bytes).
 */
export async function T_sf(pkSeed, adrsBytes, ml) {
  if (!(ml instanceof Uint8Array) || ml.length !== 32 * N) {
    throw new Error("T_sf message must be 512 bytes");
  }
  return tweaked16(pkSeed, adrsBytes, ml);
}

/**
 * T_k(pk_seed, ADRS, M_k) — compress FORS tree roots (k × 16 bytes).
 * @param {Uint8Array} pkSeed
 * @param {Uint8Array} adrsBytes
 * @param {Uint8Array} mk
 */
export async function T_k(pkSeed, adrsBytes, mk) {
  if (!(mk instanceof Uint8Array) || mk.length === 0 || mk.length % N !== 0) {
    throw new Error("T_k message must be a positive multiple of 16 bytes");
  }
  return tweaked16(pkSeed, adrsBytes, mk);
}

/**
 * H(pk_seed, ADRS, M_2) — Merkle parent of two 16-byte nodes (32-byte input).
 */
export async function H(pkSeed, adrsBytes, m2) {
  if (!(m2 instanceof Uint8Array) || m2.length !== 2 * N) {
    throw new Error("H message must be 32 bytes");
  }
  return tweaked16(pkSeed, adrsBytes, m2);
}

/**
 * H_grind(pk_seed, ADRS, digest, counter) — WOTS+C grinding map.
 * Input layout: pk_seed || zeros(48) || ADRS[:10] || digest || zeros(4) || counter_be16
 */
export async function H_grind(pkSeed, adrsBytes, digest, counter) {
  assertPkSeed(pkSeed);
  assertAdrs(adrsBytes);
  if (!(digest instanceof Uint8Array) || digest.length !== 32) {
    throw new Error("H_grind digest must be 32 bytes");
  }
  if (!Number.isInteger(counter) || counter < 0 || counter > 0xffff) {
    throw new Error("H_grind counter must be a UInt16");
  }
  const digestFull = await sha256(
    concatBytes(
      pkSeed,
      zeros(PK_SEED_PAD),
      adrsBytes.slice(0, 10),
      digest,
      zeros(4),
      u16be(counter)
    )
  );
  return digestFull.slice(0, N);
}

export const NODE_SIZE = N;
export const CHAIN_MAX = 15;
export const CHAIN_LENGTH = 16; // positions 0..15
