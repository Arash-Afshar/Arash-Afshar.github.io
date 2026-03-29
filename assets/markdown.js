function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function isImageOnlyLine(line) {
  return /^!\[([^\]]*)\]\(([^)]+)\)$/.test(line.trim());
}

function renderInline(markdown) {
  const tokens = [];
  let text = markdown;

  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const key = `@@TOKEN_${tokens.length}@@`;
    tokens.push(`<code>${escapeHtml(code)}</code>`);
    return key;
  });

  text = escapeHtml(text);
  text = text.replace(/&lt;(\/?(?:sub|sup|br))&gt;/g, "<$1>");

  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    return `<img alt="${alt}" src="${src}" loading="lazy">`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const external = /^https?:\/\//.test(href);
    const attrs = external ? ' target="_blank" rel="noreferrer"' : "";
    return `<a href="${href}"${attrs}>${label}</a>`;
  });

  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^\w])\*([^*]+)\*(?!\w)/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^\w])_([^_]+)_(?!\w)/g, "$1<em>$2</em>");

  tokens.forEach((token, index) => {
    text = text.replace(`@@TOKEN_${index}@@`, token);
  });

  return text;
}

function normalizeMarkdown(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const normalized = [];
  let inFrontMatter = false;
  let frontMatterClosed = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (index === 0 && line.trim() === "---") {
      inFrontMatter = true;
      continue;
    }

    if (inFrontMatter) {
      if (line.trim() === "---") {
        inFrontMatter = false;
        frontMatterClosed = true;
      }
      continue;
    }

    if (!frontMatterClosed && line.trim() === "") {
      continue;
    }

    if (/^\{\%\s*highlight\s+/.test(line)) {
      const match = line.match(/^\{\%\s*highlight\s+([a-zA-Z0-9_-]+)\s*\%\}$/);
      normalized.push(match ? `\`\`\`${match[1]}` : "```");
      continue;
    }

    if (/^\{\%\s*endhighlight\s*\%\}$/.test(line)) {
      normalized.push("```");
      continue;
    }

    if (/^\{:\s*\.center-image\s*\}$/.test(line)) {
      continue;
    }

    normalized.push(line);
  }

  const referenceMap = new Map();
  const contentLines = [];

  normalized.forEach((line) => {
    const match = line.match(/^\[([^\]]+)\]:\s+(.+)$/);
    if (match) {
      referenceMap.set(match[1].trim().toLowerCase(), match[2].trim());
      return;
    }
    contentLines.push(line);
  });

  const resolved = contentLines.map((line) => {
    return line.replace(/\[([^\]]+)\]\[([^\]]+)\]/g, (full, label, ref) => {
      const href = referenceMap.get(ref.trim().toLowerCase());
      return href ? `[${label}](${href})` : full;
    });
  });

  return resolved.join("\n").trim();
}

function collectParagraph(lines, startIndex) {
  const parts = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    const next = lines[index + 1] ?? "";

    if (
      line.trim() === "" ||
      isImageOnlyLine(line) ||
      /^#{1,6}\s+/.test(line) ||
      /^```/.test(line) ||
      /^[-*+]\s+/.test(line) ||
      /^\d+\.\s+/.test(line) ||
      /^>\s?/.test(line) ||
      /^---+$/.test(line.trim()) ||
      /^===+$/.test(next.trim()) ||
      /^---+$/.test(next.trim())
    ) {
      break;
    }

    parts.push(line.trim());
    index += 1;
  }

  const text = parts.join(" ");
  return {
    html: `<p>${renderInline(text)}</p>`,
    nextIndex: index,
  };
}

function collectList(lines, startIndex, ordered) {
  const matcher = ordered ? /^\d+\.\s+(.*)$/ : /^[-*+]\s+(.*)$/;
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!matcher.test(line)) {
      break;
    }

    items.push(`<li>${renderInline(line.replace(matcher, "$1").trim())}</li>`);
    index += 1;
  }

  const tag = ordered ? "ol" : "ul";
  return {
    html: `<${tag}>${items.join("")}</${tag}>`,
    nextIndex: index,
  };
}

function collectBlockquote(lines, startIndex) {
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!/^>\s?/.test(line)) {
      break;
    }
    items.push(line.replace(/^>\s?/, ""));
    index += 1;
  }

  return {
    html: `<blockquote>${renderMarkdown(items.join("\n"))}</blockquote>`,
    nextIndex: index,
  };
}

function renderMarkdown(source) {
  const normalized = normalizeMarkdown(source);
  if (!normalized) {
    return "";
  }

  const lines = normalized.split("\n");
  const output = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const next = lines[index + 1] ?? "";

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (isImageOnlyLine(line)) {
      output.push(`<figure class="image-block">${renderInline(line.trim())}</figure>`);
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const block = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        block.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      const languageTag = language ? ` data-language="${language}"` : "";
      output.push(
        `<pre${languageTag}><code>${escapeHtml(block.join("\n"))}</code></pre>`
      );
      continue;
    }

    const atx = line.match(/^(#{1,6})\s+(.*)$/);
    if (atx) {
      const level = atx[1].length;
      const text = atx[2].trim();
      output.push(
        `<h${level} id="${slugifyHeading(text)}">${renderInline(text)}</h${level}>`
      );
      index += 1;
      continue;
    }

    if (/^===+$/.test(next.trim()) || /^---+$/.test(next.trim())) {
      const level = /^===+$/.test(next.trim()) ? 1 : 2;
      const text = line.trim();
      output.push(
        `<h${level} id="${slugifyHeading(text)}">${renderInline(text)}</h${level}>`
      );
      index += 2;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      output.push("<hr>");
      index += 1;
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const list = collectList(lines, index, false);
      output.push(list.html);
      index = list.nextIndex;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const list = collectList(lines, index, true);
      output.push(list.html);
      index = list.nextIndex;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const blockquote = collectBlockquote(lines, index);
      output.push(blockquote.html);
      index = blockquote.nextIndex;
      continue;
    }

    const paragraph = collectParagraph(lines, index);
    output.push(paragraph.html);
    index = paragraph.nextIndex;
  }

  return output.join("\n");
}

window.MarkdownRenderer = {
  render: renderMarkdown,
};
