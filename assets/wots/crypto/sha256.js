/**
 * SHA-256 via Web Crypto. Returns a Uint8Array of 32 bytes.
 */

export async function sha256(message) {
  const data =
    message instanceof Uint8Array
      ? message
      : new Uint8Array(message);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}
