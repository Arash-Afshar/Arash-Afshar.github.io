If you have been reading about post-quantum cryptography, you have probably come across **one-time signatures**. WOTS, the Winternitz One-Time Signature scheme, builds a signature from many one-way hash chains. A message decides how far along each chain the signer reveals a value; the verifier hashes forward from there to the public endpoint.

This post starts at the bottom of that idea: **one real hash chain**. The demo below derives a secret with the SHRINCS `PRF`, then walks positions `0 → 15` with the real `F` tweaked hash. Animation only replays a stored execution trace — it never invents cryptographic state.

Click a node and open **Under the hood** for the exact ADRS bytes, inputs, and outputs. Self-tests on the page compare this JavaScript port against fixed vectors from the official SHRINCS reference.

Later posts in this series will add full WOTS-TW / WOTS+C signing and the key-reuse visualization that shows why “one-time” matters.
