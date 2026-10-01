In contrast to [WOTS](/blog/wots/), which is a **one-time** signature, **FORS** (Forest of Random Subsets) is a **few-time** scheme: you can safely sign more than once with the same key, as long as you stay within a budget the parameters were chosen for. See [why WOTS cannot be reused](/blog/wots-reuse/) for the one-time side of that tradeoff.

A FORS keypair is a *forest* of Merkle trees. Two parameters set its shape:

- **`k`** — how many trees are in the forest (and how many leaves a signature reveals).
- **`a`** — the height of each tree, so each tree has 2<sup>a</sup> leaves.

The public key is a hash of all `k` tree roots. Secrets live at the leaves: each leaf is the hash of a private preimage.

To sign, hash the message into `k` indexes of `a` bits each. Index `i` picks one leaf in tree `i`. The signature publishes that leaf’s secret preimage together with the Merkle authentication path up to the root. The verifier hashes the preimage into a leaf, climbs the path to rebuild each root, then checks that those roots compress to the public key.

So where WOTS walks *along* hash chains, FORS *selects* leaves in a forest and proves they belong under published roots. Larger `k` and `a` mean more leaves to choose from — and more room to sign a few messages before the revealed set gets dangerous. The demo above uses a small forest (`k=4`, `a=3`) so every node fits on screen; step through with **Next** / **Prev** (or **Play**).
