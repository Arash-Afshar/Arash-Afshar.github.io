/**
 * In-browser self-tests for Task 1 foundational crypto.
 * Compare JavaScript outputs byte-for-byte against SHRINCS reference vectors.
 */

import {
  hexToBytes,
  bytesToHex,
  base2b,
  u32be,
  u64be,
} from "./bytes.js";
import { sha256 } from "./sha256.js";
import {
  Address,
  ADRS_TYPES,
  makeStatelessWotsAddress,
  makeStatefulWotsAddress,
} from "./address.js";
import { F, PRF, T_sl, T_sf, H_grind } from "./primitives.js";
import { chainIter, buildFullChain } from "./chain.js";

async function loadVectors() {
  const url = new URL("./reference-vectors.json", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load reference vectors: ${response.status}`);
  }
  return response.json();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertHexEqual(actual, expected, label) {
  const actualHex =
    typeof actual === "string" ? actual.toLowerCase() : bytesToHex(actual);
  const expectedHex = expected.toLowerCase();
  assert(
    actualHex === expectedHex,
    `${label}: expected ${expectedHex}, got ${actualHex}`
  );
}

/**
 * @returns {Promise<{ passed: number, failed: number, results: Array<{name:string, ok:boolean, detail?:string}> }>}
 */
export async function runSelfTests() {
  const results = [];
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, ok: true });
      passed += 1;
    } catch (error) {
      results.push({ name, ok: false, detail: error.message });
      failed += 1;
    }
  }

  const V = await loadVectors();
  const pkSeed = hexToBytes(V.pkSeed);
  const skSeed = hexToBytes(V.skSeed);
  const node0 = hexToBytes(V.node0);

  await test("SHA-256 empty", async () => {
    assertHexEqual(await sha256(new Uint8Array()), V.sha256Empty, "sha256Empty");
  });

  await test("SHA-256 abc", async () => {
    assertHexEqual(
      await sha256(new TextEncoder().encode("abc")),
      V.sha256Abc,
      "sha256Abc"
    );
  });

  await test("byte conversion round-trip", async () => {
    const hex = "deadbeefcafebabe0011223344556677";
    assertHexEqual(bytesToHex(hexToBytes(hex)), hex, "hex round-trip");
    assertHexEqual(u32be(0x00000007), "00000007", "u32be");
    assertHexEqual(u64be(42), "000000000000002a", "u64be");
  });

  await test("base2b conversion", async () => {
    const digits = base2b(hexToBytes(V.base2bInput), 4, 32);
    assert(digits.length === 32, "expected 32 digits");
    assert(
      digits.every((d) => d >= 0 && d <= 15),
      "digits must be in [0,15]"
    );
    assert(
      JSON.stringify(digits) === JSON.stringify(V.base2bDigits4x32),
      "base2b mismatch vs reference"
    );
  });

  await test("address serialization size and setters", async () => {
    const adrs = makeStatelessWotsAddress({
      layer: 0,
      treeAddress: 0,
      keypairIndex: 7,
      chainIndex: 3,
    });
    assert(adrs.bytes.length === 22, "ADRS size");
    adrs.setType(ADRS_TYPES.SL_WOTS_TW_HASH).setHashIndex(0);
    assertHexEqual(adrs.toHex(), V.fTw.adrs, "stateless ADRS");

    const sf = makeStatefulWotsAddress({
      nodeHeight: 5,
      nodeIndex: 42,
      chainIndex: 11,
      treeStructure: new Uint8Array([0, 0]),
    });
    sf.setType(ADRS_TYPES.SF_WOTS_C_HASH).clearBytes10to13().setHashIndex(2);
    assertHexEqual(sf.toHex(), V.fSf.adrs, "stateful ADRS");
  });

  await test("F (WOTS-TW) reference vector", async () => {
    assertHexEqual(
      await F(pkSeed, hexToBytes(V.fTw.adrs), node0),
      V.fTw.out,
      "F TW"
    );
    assertHexEqual(
      await F(pkSeed, hexToBytes(V.fTwHi5.adrs), node0),
      V.fTwHi5.out,
      "F TW hi=5"
    );
  });

  await test("F (WOTS+C) reference vector", async () => {
    assertHexEqual(
      await F(pkSeed, hexToBytes(V.fSf.adrs), node0),
      V.fSf.out,
      "F SF"
    );
  });

  await test("PRF reference vectors", async () => {
    assertHexEqual(
      await PRF(pkSeed, skSeed, hexToBytes(V.prfTw.adrs)),
      V.prfTw.out,
      "PRF TW"
    );
    assertHexEqual(
      await PRF(pkSeed, skSeed, hexToBytes(V.prfSf.adrs)),
      V.prfSf.out,
      "PRF SF"
    );
  });

  await test("T_sl / T_sf reference vectors", async () => {
    const tip = hexToBytes(V.chainTwNodes[15]);
    const tipsTw = new Uint8Array(35 * 16);
    for (let i = 0; i < 35; i += 1) {
      tipsTw.set(tip, i * 16);
    }
    assertHexEqual(
      await T_sl(pkSeed, hexToBytes(V.tSl.adrs), tipsTw),
      V.tSl.out,
      "T_sl"
    );

    const tipsSf = new Uint8Array(32 * 16);
    for (let i = 0; i < 32; i += 1) {
      tipsSf.set(tip, i * 16);
    }
    assertHexEqual(
      await T_sf(pkSeed, hexToBytes(V.tSf.adrs), tipsSf),
      V.tSf.out,
      "T_sf"
    );
  });

  await test("H_grind reference vector", async () => {
    assertHexEqual(
      await H_grind(
        pkSeed,
        hexToBytes(V.hGrind.adrs),
        hexToBytes(V.hGrind.digest),
        V.hGrind.counter
      ),
      V.hGrind.out,
      "H_grind"
    );
  });

  await test("chain zero-step case", async () => {
    const secret = hexToBytes(V.prfTw.out);
    const adrs = new Address(hexToBytes(V.prfTw.adrs));
    const result = await chainIter({
      node: secret,
      start: 7,
      steps: 0,
      pkSeed,
      address: adrs,
      scheme: "WOTS-TW",
    });
    assert(result.steps.length === 0, "zero steps records nothing");
    assertHexEqual(result.node, V.chainTwZeroSteps, "zero-step node");
  });

  await test("chain full 15-step WOTS-TW", async () => {
    const secret = hexToBytes(V.prfTw.out);
    const address = new Address(hexToBytes(V.prfTw.adrs));
    const chain = await buildFullChain({
      secret,
      pkSeed,
      address,
      scheme: "WOTS-TW",
    });
    assert(chain.nodes.length === 16, "16 nodes");
    for (let i = 0; i < 16; i += 1) {
      assertHexEqual(chain.nodes[i], V.chainTwNodes[i], `TW node ${i}`);
    }
    assertHexEqual(chain.endpoint, V.chainTwEndpoint, "TW endpoint");
    assert(chain.counters.chainHashCalls === 15, "15 chain hashes");
  });

  await test("chain partial start+steps WOTS-TW", async () => {
    const secret = hexToBytes(V.prfTw.out);
    const address = new Address(hexToBytes(V.prfTw.adrs));
    const to3 = await chainIter({
      node: secret,
      start: 0,
      steps: 3,
      pkSeed,
      address,
      scheme: "WOTS-TW",
    });
    const to7 = await chainIter({
      node: to3.node,
      start: 3,
      steps: 4,
      pkSeed,
      address,
      scheme: "WOTS-TW",
    });
    assertHexEqual(to7.node, V.chainTwPartial3to7, "partial 3->7");
  });

  await test("chain full 15-step WOTS+C (after ADRS[10:14] clear)", async () => {
    const secret = hexToBytes(V.prfSf.out);
    const address = new Address(hexToBytes(V.chainSfAdrsAfterClear));
    const chain = await buildFullChain({
      secret,
      pkSeed,
      address,
      scheme: "WOTS+C",
    });
    for (let i = 0; i < 16; i += 1) {
      assertHexEqual(chain.nodes[i], V.chainSfNodes[i], `SF node ${i}`);
    }
    assertHexEqual(chain.endpoint, V.chainSfEndpoint, "SF endpoint");
  });

  return { passed, failed, results };
}
