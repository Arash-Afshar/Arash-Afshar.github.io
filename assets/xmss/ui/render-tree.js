/**
 * Render a single XMSS Merkle tree with leaf / auth / path highlights.
 */

import { bytesToHex } from "../../wots/crypto/bytes.js";

/**
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {Awaited<ReturnType<import("../crypto/xmss.js").signXmss>>} opts.trace
 * @param {ReturnType<import("./sign-steps.js").viewModelAt>} opts.view
 */
export function renderXmssTree(root, opts) {
  const { trace, view } = opts;
  const { h } = trace.params;
  const idx = trace.leafIndex;

  root.removeAttribute("aria-busy");
  root.innerHTML = `
    <div class="xmss-wrap">
      <div class="xmss-legend">
        <span><i class="xmss-swatch xmss-swatch--empty"></i> hidden</span>
        <span><i class="xmss-swatch xmss-swatch--leaf"></i> WOTS leaf</span>
        <span><i class="xmss-swatch xmss-swatch--spent"></i> spent leaf</span>
        <span><i class="xmss-swatch xmss-swatch--sib"></i> auth sibling</span>
        <span><i class="xmss-swatch xmss-swatch--path"></i> path / root</span>
        <span><i class="xmss-swatch xmss-swatch--focus"></i> current step</span>
      </div>
      <div class="xmss-tree">
        <div class="xmss-tree-head">
          <strong>XMSS tree (h=${h})</strong>
          <span class="xmss-muted">${
            view.pkShown ? `pk ${trace.publicKeyShort}…` : "pk ······"
          }</span>
        </div>
        <div class="xmss-tree-body">
          ${renderLevels(trace, view, h, idx)}
        </div>
        <div class="xmss-tree-foot xmss-muted">
          ${
            view.selectedLeaf !== null
              ? `signing leaf ${view.selectedLeaf}${view.done ? " (spent)" : ""}`
              : "no leaf selected yet"
          }
        </div>
      </div>
    </div>
  `;
}

function renderLevels(trace, view, h, spentIdx) {
  const levelsHtml = [];

  for (let height = h; height >= 0; height -= 1) {
    const width = 1 << (h - height);
    const cells = [];
    for (let local = 0; local < width; local += 1) {
      const node = trace.tree.levels[height][local];
      const shown = view.nodesShown[height][local];
      const isSpentLeaf = height === 0 && local === spentIdx && view.selectedLeaf === spentIdx;
      const isSibling =
        height < h &&
        view.authRevealed[height] &&
        local === ((spentIdx >> height) ^ 1);
      const onPath =
        view.leafMatched &&
        height > 0 &&
        height <= Math.max(0, view.climbHeight) &&
        local === (spentIdx >> height);
      const isRoot = height === h && view.pkShown;
      const isFocusNode =
        view.focusNodeHeight === height && view.focusNodeIndex === local;
      const isFocusLeaf =
        height === 0 &&
        local === view.selectedLeaf &&
        (view.step.kind === "pick-leaf" ||
          view.step.kind === "wots-sign" ||
          view.step.kind === "wots-leaf" ||
          view.step.kind === "leaf-pk");
      const isFocusSib =
        view.step.kind === "auth-sibling" &&
        view.focusPathHeight === height &&
        isSibling;
      const isFocusClimb =
        view.step.kind === "verify-climb" &&
        view.focusClimbHeight === height &&
        local === (spentIdx >> height);

      let cls = "xmss-node";
      let label = "·";
      let title = `height ${height}, index ${local}`;

      if (height === 0 && shown) {
        cls += " is-leaf";
        if (isSpentLeaf && (view.wotsDone || view.done)) {
          cls += " is-spent";
        }
        label = node.short.slice(0, 4);
        title += ` — WOTS pk ${bytesToHex(node.hash)}`;
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
      } else if (shown) {
        cls += " is-shown";
        label = node.short.slice(0, 4);
        title += ` — ${bytesToHex(node.hash)}`;
      } else if (height === 0) {
        label = String(local);
      }

      if (isFocusNode || isFocusLeaf || isFocusSib || isFocusClimb) {
        cls += " is-focus";
      }

      cells.push(
        `<button type="button" class="${cls}" title="${escapeAttr(title)}" data-h="${height}" data-i="${local}"><span>${label}</span></button>`
      );
    }
    levelsHtml.push(
      `<div class="xmss-level" data-height="${height}" style="--xmss-level-count:${width}">${cells.join("")}</div>`
    );
  }

  return levelsHtml.join("");
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}
