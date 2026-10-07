[WOTS](/blog/wots/) gives you a **one-time** signature which [breaks if used to sign more than one message](/blog/wots-reuse/). **XMSS** (eXtended Merkle Signature Scheme) is how you turn many WOTS keys into a single many-time verifying key.

The demo above builds a small tree (`h=3`, eight WOTS leaves) so every node fits on screen. Step through key generation, a signature with its authentication path, and verification with **Next** / **Prev** (or **Play**).
