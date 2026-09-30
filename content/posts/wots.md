If you have been reading about post-quantum cryptography, you have probably come across **one-time signatures**. WOTS, the Winternitz One-Time Signature scheme, builds a signature from many one-way hash chains. A message decides how far along each chain the signer reveals a value; the verifier hashes forward from there to the public endpoint.

The interactive demo above signs a real 16-byte message with **WOTS-TW**: it splits the message into 4-bit digits, derives a checksum, walks each of the 35 hash chains with the SHRINCS `PRF` / `F` primitives, and assembles the signature from the revealed nodes. Use **Next** / **Prev** (or **Play**) to step through that process — every displayed value comes from an in-browser execution trace, not a toy diagram.

Later posts in this series will add other parts of SPHINCS and SHRINCS protocols.
