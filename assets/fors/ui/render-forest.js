/**
 * Render the FORS forest: k Merkle trees with selection / auth / root highlights.
 * Bottom of each tree: secret preimages, then leaf hashes F(preimage) above them.
 */

import { bytesToHex } from "../../wots/crypto/bytes.js";

/**
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {Awaited<ReturnType<import("../crypto/fors.js").signFors>>} opts.trace
 * @param {ReturnType<import("./sign-steps.js").viewModelAt>} opts.view
 */
export function renderForest(root, opts) {
  const { trace, view } = opts;
  const { a } = trace.params;

  root.removeAttribute("aria-busy");
  root.innerHTML = `
    <div class="fors-forest">
      <div class="fors-legend">
        <span><i class="fors-swatch fors-swatch--empty"></i> hidden</span>
        <span><i class="fors-swatch fors-swatch--sk"></i> secret preimage</span>
        <span><i class="fors-swatch fors-swatch--leaf"></i> leaf = F(sk)</span>
        <span><i class="fors-swatch fors-swatch--sib"></i> auth sibling</span>
        <span><i class="fors-swatch fors-swatch--path"></i> path / root</span>
        <span><i class="fors-swatch fors-swatch--focus"></i> current step</span>
      </div>
      <div class="fors-trees">
        ${trace.trees
          .map((tree, i) => renderTreeColumn(tree, i, view, a))
          .join("")}
      </div>
    </div>
  `;
}

function renderTreeColumn(tree, treeIndex, view, a) {
  const focus = view.focusTree === treeIndex;
  const leafOn = view.leafRevealed[treeIndex];
  const skOn = view.skRevealed[treeIndex];
  const rootOn = view.rootReady[treeIndex];
  const selected = view.indexesRevealed[treeIndex];
  const leafCount = 1 << a;

  const levelsHtml = [];
  for (let h = a; h >= 0; h -= 1) {
    const width = 1 << (a - h);
    const cells = [];
    for (let local = 0; local < width; local += 1) {
      const node = tree.levels[h][local];
      const isSelectedLeaf = h === 0 && local === tree.leafInTree;
      const isSibling =
        h < a &&
        view.authRevealed[treeIndex]?.[h] &&
        local === ((tree.leafInTree >> h) ^ 1);
      const pathUnlocked =
        leafOn &&
        (h === 0 ||
          Array.from({ length: h }, (_, j) => view.authRevealed[treeIndex][j]).every(
            Boolean
          ));
      const onPath =
        pathUnlocked &&
        h > 0 &&
        local === (tree.leafInTree >> h);
      const isRoot = h === a && rootOn;
      const isFocusLeaf =
        focus &&
        isSelectedLeaf &&
        (view.step.kind === "leaf-hash" || view.step.kind === "index");
      const isFocusSib =
        focus &&
        view.step.kind === "auth-sibling" &&
        view.focusPathHeight === h &&
        isSibling;

      let cls = "fors-node";
      let label = "·";
      let title = `tree ${treeIndex}, height ${h}, index ${local}`;

      if (h === 0 && isSelectedLeaf && selected) {
        cls += " is-selected";
        if (leafOn) {
          cls += " is-leaf";
          label = node.short.slice(0, 4);
          title += ` — leaf F(sk) ${bytesToHex(node.hash)}`;
        } else {
          label = String(local);
          title += " — selected leaf (hash not yet)";
        }
      } else if (isSibling) {
        cls += " is-sib";
        label = node.short.slice(0, 4);
        title += ` — auth sibling ${bytesToHex(node.hash)}`;
      } else if (isRoot || onPath) {
        cls += " is-path";
        label = node.short.slice(0, 4);
        title += isRoot
          ? ` — root ${bytesToHex(node.hash)}`
          : ` — path node ${bytesToHex(node.hash)}`;
      } else if (h === 0 && selected) {
        label = String(local);
      }

      if (isFocusLeaf || isFocusSib || (focus && isRoot && view.step.kind === "root-ready")) {
        cls += " is-focus";
      }

      cells.push(
        `<button type="button" class="${cls}" title="${escapeAttr(title)}" data-h="${h}" data-i="${local}"><span>${label}</span></button>`
      );
    }
    levelsHtml.push(
      `<div class="fors-level" data-height="${h}" style="--fors-level-count:${width}">${cells.join("")}</div>`
    );
  }

  // Bottom layer: secret preimages (one cell per leaf index).
  const skCells = [];
  for (let local = 0; local < leafCount; local += 1) {
    const node = tree.levels[0][local];
    const isSelected = local === tree.leafInTree;
    const isFocusSk =
      focus && isSelected && view.step.kind === "reveal-sk";

    let cls = "fors-node fors-node--sk";
    let label = "·";
    let title = `tree ${treeIndex}, secret preimage for leaf ${local}`;

    if (isSelected && selected) {
      cls += " is-selected";
      if (skOn) {
        cls += " is-sk";
        label = node.preimageShort.slice(0, 4);
        title += ` — ${bytesToHex(node.preimage)}`;
      } else {
        label = "sk";
        title += " — selected (not yet revealed)";
      }
    }

    if (isFocusSk) {
      cls += " is-focus";
    }

    skCells.push(
      `<button type="button" class="${cls}" title="${escapeAttr(title)}" data-sk="${local}"><span>${label}</span></button>`
    );
  }
  levelsHtml.push(
    `<div class="fors-level fors-level--sk" data-height="sk" style="--fors-level-count:${leafCount}">${skCells.join("")}</div>`
  );

  return `
    <div class="fors-tree ${focus ? "is-focus-tree" : ""}" data-tree="${treeIndex}">
      <div class="fors-tree-head">
        <strong>Tree ${treeIndex}</strong>
        <span class="fors-muted">${
          rootOn ? `root ${tree.rootShort}…` : "root ······"
        }</span>
      </div>
      <div class="fors-tree-body">${levelsHtml.join("")}</div>
      <div class="fors-tree-foot fors-muted">
        ${selected ? `leaf ${tree.leafInTree}` : "leaf ·"}
      </div>
    </div>
  `;
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}
