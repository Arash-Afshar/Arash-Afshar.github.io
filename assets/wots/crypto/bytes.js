/**
 * Byte helpers for the SHRINCS WOTS visualizer.
 * Ported to match impl/shrincs.py helper behavior.
 */

export function concatBytes(...parts) {
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function hexToBytes(hex) {
  const cleaned = hex.trim().toLowerCase().replace(/^0x/, "");
  if (cleaned.length % 2 !== 0) {
    throw new Error("hex string must have even length");
  }
  if (!/^[0-9a-f]*$/.test(cleaned)) {
    throw new Error("hex string contains non-hex characters");
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function zeros(n) {
  return new Uint8Array(n);
}

export function replicate(byte, n) {
  return new Uint8Array(n).fill(byte & 0xff);
}

export function u8(n) {
  if (!Number.isInteger(n) || n < 0 || n > 0xff) {
    throw new Error(`u8 out of range: ${n}`);
  }
  return new Uint8Array([n]);
}

export function u16be(n) {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) {
    throw new Error(`u16 out of range: ${n}`);
  }
  const out = new Uint8Array(2);
  out[0] = (n >>> 8) & 0xff;
  out[1] = n & 0xff;
  return out;
}

export function u32be(n) {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new Error(`u32 out of range: ${n}`);
  }
  const out = new Uint8Array(4);
  out[0] = (n >>> 24) & 0xff;
  out[1] = (n >>> 16) & 0xff;
  out[2] = (n >>> 8) & 0xff;
  out[3] = n & 0xff;
  return out;
}

export function u64be(n) {
  if (typeof n !== "bigint") {
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`u64 out of range: ${n}`);
    }
    n = BigInt(n);
  }
  if (n < 0n || n > 0xffffffffffffffffn) {
    throw new Error(`u64 out of range: ${n}`);
  }
  const out = new Uint8Array(8);
  let value = n;
  for (let i = 7; i >= 0; i -= 1) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

export function ceildiv(a, b) {
  return Math.floor((a + b - 1) / b);
}

/**
 * Decompose bytes into `outlen` groups of `bitsPerDigit` bits.
 * Matches shrincs.base_2b.
 */
export function base2b(bytes, bitsPerDigit, outlen) {
  if (bytes.length < ceildiv(outlen * bitsPerDigit, 8)) {
    throw new Error("base2b input too short");
  }

  const baseb = new Array(outlen);
  let j = 0;
  let acc = 0;
  let bitsFilled = 0;

  for (let i = 0; i < outlen; i += 1) {
    while (bitsFilled < bitsPerDigit) {
      acc = (acc << 8) + bytes[j];
      j += 1;
      bitsFilled += 8;
    }
    bitsFilled -= bitsPerDigit;
    baseb[i] = acc >> bitsFilled;
    acc %= 2 ** bitsFilled;
  }

  return baseb;
}

export function equalBytes(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
