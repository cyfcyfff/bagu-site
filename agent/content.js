function siteBase() {
  const path = (typeof location !== "undefined" && location.pathname) ? location.pathname : "/";
  if (path.endsWith("/index.html")) return path.slice(0, -10);
  if (path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function siteRoot() {
  let p = (typeof location !== "undefined" && location.pathname) ? location.pathname : "/";
  if (p.endsWith("/index.html")) p = p.slice(0, -10);
  if (p.endsWith("/")) p = p.slice(0, -1);
  if (p.endsWith("/java") || p.endsWith("/agent")) p = p.slice(0, p.lastIndexOf("/"));
  return p;
}

function assetUrl(src) {
  if (!src) return src;
  if (!src.startsWith("/")) return src;
  return siteBase() + src;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayTitle(value) {
  return String(value == null ? "" : value).replace(/^\d+[\.．、]\s*/, "");
}

function renderInline(value) {
  let text = String(value == null ? "" : value);
  text = text.replace(/\*\*((?:(?!\*\*)[\s\S])+?)\*\*(?=\*\*)/g, "**$1");
  const parts = [];
  const re = /(`[^`]+`)|(\$\$[^$]+\$\$)|(\$[^$]+\$)|(\*\*(?:(?!\*\*)[\s\S])+?\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push({ type: "text", value: text.slice(last, match.index) });
    const token = match[0];
    if (token.startsWith("`")) {
      let code = token.slice(1, -1);
      if (/^\*\*[\s\S]*\*\*$/.test(code)) code = code.slice(2, -2);
      parts.push({ type: "code", value: code });
    }
    else if (token.startsWith("$$")) parts.push({ type: "math", value: token.slice(2, -2) });
    else if (token.startsWith("$")) parts.push({ type: "math", value: token.slice(1, -1) });
    else if (token.startsWith("**")) parts.push({ type: "strong", value: token.slice(2, -2) });
    else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      parts.push({ type: "link", text: link[1], href: link[2] });
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.map((part) => {
    // 语雀导出时加粗标记常被拆碎，残留的不成对 ** 不显示出来
    if (part.type === "text") return escapeHtml(part.value.replace(/\*\*/g, ""));
    if (part.type === "code") return `<code>${escapeHtml(part.value)}</code>`;
    if (part.type === "math") return `<span class="math">${escapeHtml(part.value)}</span>`;
    if (part.type === "strong") return `<strong>${escapeHtml(part.value)}</strong>`;
    if (part.type === "link") {
      const href = String(part.href || "");
      const safe = /^(https?:|\/|mailto:)/i.test(href) ? href : "#";
      return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(part.text)}</a>`;
    }
    return "";
  }).join("");
}

function renderImageBlock(block) {
  const caption = escapeHtml(block.caption || "");
  if (block.src) {
    return `<figure>
      <img draggable="false" src="${escapeHtml(assetUrl(block.src))}" alt="${caption || "知识点配图"}">
      ${caption ? `<figcaption>${caption}</figcaption>` : ""}
    </figure>`;
  }
  return `<figure>
    <div class="img-slot">
      <b>配图位置</b>
      <span>${caption ? "待上传：" + caption : "还没有上传图片，可在管理后台插入。"}</span>
    </div>
    ${caption ? `<figcaption>${caption}</figcaption>` : ""}
  </figure>`;
}

function renderCompareBlock(block) {
  const cost = (text) => text ? `<div class="cost">${renderInline(text)}</div>` : "";
  return `<div class="compare">
    <div class="col">
      <span class="tag tag-cpp">${escapeHtml(block.leftTag || "C++")}</span>
      <p>${renderInline(block.left || "")}</p>
      ${cost(block.leftCost)}
    </div>
    <div class="col">
      <span class="tag tag-java">${escapeHtml(block.rightTag || (typeof window !== "undefined" && window.BAGU_COMPARE_TAG) || "Java")}</span>
      <p>${renderInline(block.right || "")}</p>
      ${cost(block.rightCost)}
    </div>
  </div>`;
}

// 列表标签：如 “现象：……”、“原理：……”
const LIST_LABEL_RE = /^\s*(\*\*)?([^*：:\n]{1,48}?)(\*\*)?\s*([：:？?])\s*([\s\S]*)$/;

function parseListLabel(text) {
  const match = String(text == null ? "" : text).trim().match(LIST_LABEL_RE);
  if (!match) return null;
  const label = match[2].replace(/\*+/g, "").trim();
  if (!label || /[。，,；;]/.test(label)) return null;
  // 语雀加粗收尾常落在冒号后，只剩 ** 时视为没有正文
  const body = (match[5] || "").replace(/\*+/g, "").trim();
  return { label: label, body: body };
}

function isExplicitListStyle(style) {
  return style === "disc" || style === "decimal" || style === "alpha" || style === "paren";
}

function listStyleFromMarker(marker) {
  const m = String(marker || "").trim();
  if (/^[a-z]\.$/.test(m)) return "alpha";
  if (/^\d+[）)]$/.test(m)) return "paren";
  if (/^\d+\.$/.test(m)) return "decimal";
  return "disc";
}

function listStyleFromElement(el) {
  if (!el) return "";
  if (typeof hasClass === "function") {
    if (hasClass(el, "list-paren")) return "paren";
    if (hasClass(el, "list-alpha")) return "alpha";
    if (hasClass(el, "list-decimal")) return "decimal";
  } else {
    const cls = " " + (el.className || "") + " ";
    if (cls.indexOf(" list-paren ") >= 0) return "paren";
    if (cls.indexOf(" list-alpha ") >= 0) return "alpha";
    if (cls.indexOf(" list-decimal ") >= 0) return "decimal";
  }
  const type = el.style && el.style.listStyleType;
  if (type === "lower-alpha" || type === "lower-latin") return "alpha";
  if (type === "decimal") return "decimal";
  return "";
}

function listBullet(style, index) {
  if (style === "alpha") return String.fromCharCode(97 + (index % 26)) + ". ";
  if (style === "paren") return (index + 1) + "）";
  if (style === "decimal") return (index + 1) + ". ";
  return "- ";
}

function listClassName(style) {
  if (style === "alpha") return "list-alpha";
  if (style === "paren") return "list-paren";
  if (style === "decimal") return "list-decimal";
  return "";
}

function wrapListItem(item) {
  if (typeof item === "string") return { text: item, children: [], ordered: false };
  const out = {
    text: item && item.text ? item.text : "",
    children: item && item.children ? item.children.slice() : [],
    ordered: !!(item && item.ordered)
  };
  if (item && isExplicitListStyle(item.style)) out.style = item.style;
  return out;
}

function simplifyListItem(item) {
  const kids = (item.children || []).map((child) => (
    typeof child === "string" ? child : simplifyListItem(child)
  ));
  if (!kids.length) return item.text || "";
  const out = { text: item.text || "", children: kids, ordered: !!item.ordered };
  if (isExplicitListStyle(item.style)) out.style = item.style;
  return out;
}

// 把“现象 / 原理 / 后果”这类并列标签抬回同一级，无标签的说明句收进上一个标签下面
function regroupLiftedListItems(items) {
  const result = [];
  (items || []).forEach((raw) => {
    const item = wrapListItem(raw);
    item.children = normalizeListItems(item.children);
    const label = parseListLabel(item.text);
    const prev = result.length ? result[result.length - 1] : null;
    const prevLabel = prev ? parseListLabel(prev.text) : null;
    // 只有无标签的说明句才收进上一个标签下面；“String： / StringBuilder：” 这种并列标签保持同级
    if (result.length && prevLabel && !label) {
      prev.children.push(simplifyListItem(item));
      prev.ordered = false;
    } else {
      result.push(item);
    }
  });
  return result;
}

// 语雀导入时 4 空格会被当成再嵌套一层，导致同级分点错挂到第一项下面。这里按大纲结构纠正。
function normalizeListItems(items) {
  return (items || []).map((raw) => {
    const item = wrapListItem(raw);
    item.children = normalizeListItems(item.children);
    if (item.children.length === 1) {
      const child = wrapListItem(item.children[0]);
      if (child.children.length) {
        const lifted = [{ text: child.text, children: [], ordered: false }].concat(
          child.children.map(wrapListItem)
        );
        item.children = regroupLiftedListItems(lifted);
      }
    }
    return simplifyListItem(item);
  });
}

function renderListItems(items, ordered, depth, style) {
  depth = depth || 1;
  if (depth === 1) items = normalizeListItems(items);
  const explicit = isExplicitListStyle(style);
  let tag;
  let cls = "";
  if (explicit) {
    // 编辑器里指定的 1. / a. / 1） / 圆点，按选择渲染，不再随层级自动切换
    tag = style === "disc" ? "ul" : "ol";
    cls = listClassName(style);
  } else {
    // 旧数据没有指定样式：第一层 1.2.3.，第二层 a.b.c.，第三层及以下用圆点
    const useOrdered = !!ordered && depth < 3;
    tag = useOrdered ? "ol" : "ul";
  }
  const inner = (items || []).map((item) => {
    if (typeof item === "string") return `<li>${renderInline(item)}</li>`;
    const childStyle = isExplicitListStyle(item.style) ? item.style : undefined;
    const childOrdered = childStyle ? childStyle !== "disc" : (depth >= 2 ? false : !!item.ordered);
    const kids = item.children && item.children.length
      ? renderListItems(item.children, childOrdered, depth + 1, childStyle)
      : "";
    return `<li>${renderInline(item.text || "")}${kids}</li>`;
  }).join("");
  const classAttr = cls ? ` class="${cls}"` : "";
  return `<${tag}${classAttr}>${inner}</${tag}>`;
}

function renderTableBlock(block) {
  const headers = block.headers || [];
  const rows = block.rows || [];
  const thead = headers.length
    ? `<thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>`
    : "";
  const tbody = `<tbody>${rows.map((row) =>
    `<tr>${(row || []).map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`
  ).join("")}</tbody>`;
  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`;
}

function renderBlock(block) {
  if (!block) return "";
  if (block.type === "heading") {
    return `<h3 class="section-title">${renderInline(block.text || "")}</h3>`;
  }
  if (block.type === "paragraph") {
    return `<p class="lead">${renderInline(block.text || "")}</p>`;
  }
  if (block.type === "quote") {
    return `<p class="quote">${renderInline(block.text || "")}</p>`;
  }
  if (block.type === "code") {
    const lang = escapeHtml(block.language || "");
    return `<pre><code class="${lang ? "language-" + lang : ""}">${escapeHtml(block.text || "")}</code></pre>`;
  }
  if (block.type === "list") return renderListItems(block.items || [], !!block.ordered, 1, block.style);
  if (block.type === "table") return renderTableBlock(block);
  if (block.type === "compare") return renderCompareBlock(block);
  if (block.type === "image") return renderImageBlock(block);
  if (block.type === "hr") return "<hr>";
  return "";
}

function renderBlocks(blocks) {
  return `<div class="article">${(blocks || []).map(renderBlock).join("")}</div>`;
}

function newBlock(type) {
  const id = "b-" + Math.random().toString(36).slice(2, 10);
  if (type === "heading") return { id, type, text: "" };
  if (type === "paragraph") return { id, type, text: "" };
  if (type === "quote") return { id, type, text: "" };
  if (type === "code") return { id, type, language: "", text: "" };
  if (type === "list") return { id, type, ordered: false, items: [""] };
  if (type === "table") return { id, type, headers: ["", ""], rows: [["", ""]] };
  if (type === "image") return { id, type, src: "", caption: "" };
  if (type === "compare") {
    return {
      id, type,
      leftTag: "C++", left: "", leftCost: "",
      rightTag: (typeof window !== "undefined" && window.BAGU_COMPARE_TAG) || "Java", right: "", rightCost: ""
    };
  }
  return { id, type: "paragraph", text: "" };
}

function newQuestion(type) {
  if (type === "card") {
    return { type: "card", front: "", back: "", explain: "" };
  }
  return {
    type: "mcq",
    prompt: "",
    options: ["", "", "", ""],
    answer: 0,
    explain: ""
  };
}

function newBlockId() {
  return "b-" + Math.random().toString(36).slice(2, 10);
}

function listToMarkdown(items, ordered, indent, style) {
  return (items || []).map((item, index) => {
    const pad = " ".repeat(indent);
    const bullet = listBullet(isExplicitListStyle(style) ? style : (ordered ? "decimal" : "disc"), index);
    if (typeof item === "string") return pad + bullet + item;
    let out = pad + bullet + (item.text || "");
    if (item.children && item.children.length) {
      const childOrdered = item.ordered != null ? !!item.ordered : false;
      out += "\n" + listToMarkdown(item.children, childOrdered, indent + 2, item.style);
    }
    return out;
  }).join("\n");
}

function tableToMarkdown(block) {
  const headers = (block.headers && block.headers.length) ? block.headers : [""];
  const width = Math.max(headers.length, ...((block.rows || []).map((row) => (row || []).length).concat([1])));
  const pad = (row) => {
    const cells = (row || []).slice();
    while (cells.length < width) cells.push("");
    return "| " + cells.map((cell) => String(cell == null ? "" : cell).replace(/\|/g, "\\|")).join(" | ") + " |";
  };
  const lines = [pad(headers), "| " + headers.map(() => "---").join(" | ") + " |"];
  for (const row of (block.rows || [])) lines.push(pad(row));
  return lines.join("\n");
}

function compareToMarkdown(block) {
  const lines = ["```compare"];
  if (block.leftTag) lines.push("leftTag: " + block.leftTag);
  if (block.rightTag) lines.push("rightTag: " + block.rightTag);
  if (block.leftCost) lines.push("leftCost: " + String(block.leftCost).replace(/\n/g, " "));
  if (block.rightCost) lines.push("rightCost: " + String(block.rightCost).replace(/\n/g, " "));
  lines.push("---");
  lines.push(block.left || "");
  lines.push("---");
  lines.push(block.right || "");
  lines.push("```");
  return lines.join("\n");
}

function fenceFor(text) {
  const matches = String(text || "").match(/`{3,}/g) || [];
  let n = 3;
  for (const m of matches) if (m.length >= n) n = m.length + 1;
  return "`".repeat(n);
}

function blocksToMarkdown(blocks) {
  const parts = [];
  for (const block of (blocks || [])) {
    if (!block) continue;
    if (block.type === "heading") parts.push("## " + (block.text || "").trim());
    else if (block.type === "paragraph") parts.push(block.text || "");
    else if (block.type === "quote") {
      const text = String(block.text || "");
      parts.push(text.split("\n").map((line) => "> " + line).join("\n"));
    } else if (block.type === "code") {
      const fence = fenceFor(block.text);
      const lang = block.language || "";
      parts.push(fence + lang + "\n" + (block.text || "") + "\n" + fence);
    } else if (block.type === "list") parts.push(listToMarkdown(block.items || [], !!block.ordered, 0, block.style));
    else if (block.type === "table") parts.push(tableToMarkdown(block));
    else if (block.type === "image") parts.push("![" + (block.caption || "") + "](" + (block.src || "") + ")");
    else if (block.type === "hr") parts.push("---");
    else if (block.type === "compare") parts.push(compareToMarkdown(block));
  }
  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isTableSep(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function isFence(line) {
  return /^(```|~~~)/.test(line.trim());
}

function parseListMarker(line) {
  const m = String(line || "").match(/^(\s*)([-*+]|\d+\.|\d+[）)]|[a-z]\.)\s*(.*)$/);
  if (!m) return null;
  return { indent: m[1].length, marker: m[2], style: listStyleFromMarker(m[2]), text: m[3] };
}

function looksLikeList(line) {
  return !!parseListMarker(line);
}

function looksLikeHeading(line) {
  return /^#{1,6}\s+\S/.test(line.trim());
}

function looksLikeHr(line) {
  return /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim());
}

function parseImageLine(line) {
  const text = String(line || "").trim();
  const re = /!\[([^\]]*)\]\(([^)]*)\)/g;
  const all = [];
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    if (text.slice(last, match.index).trim()) return null;
    all.push({ caption: match[1], src: match[2] });
    last = match.index + match[0].length;
  }
  if (!all.length || text.slice(last).trim()) return null;
  return all;
}

function looksLikeQuote(line) {
  return /^>\s?/.test(line.trim());
}

function parseCompareFence(lines, start, mark) {
  let i = start + 1;
  const meta = {};
  const body = [];
  let inMeta = true;
  while (i < lines.length && lines[i].trim() !== mark) {
    const line = lines[i];
    if (inMeta && /^(leftTag|rightTag|leftCost|rightCost)\s*:/.test(line)) {
      const idx = line.indexOf(":");
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    } else if (inMeta && line.trim() === "---") {
      inMeta = false;
      body.push("");
    } else {
      inMeta = false;
      body.push(line);
    }
    i++;
  }
  if (i < lines.length) i++;
  const joined = body.join("\n");
  const parts = joined.split(/\n---\n/);
  return {
    next: i,
    block: {
      type: "compare",
      leftTag: meta.leftTag || "C++",
      rightTag: meta.rightTag || (typeof window !== "undefined" && window.BAGU_COMPARE_TAG) || "Java",
      leftCost: meta.leftCost || "",
      rightCost: meta.rightCost || "",
      left: (parts[0] || "").trim(),
      right: (parts.slice(1).join("\n---\n") || "").trim()
    }
  };
}

function parseList(lines, start) {
  const items = [];
  const first = parseListMarker(lines[start]);
  let ordered = first.style !== "disc";
  const firstStyle = (first.style === "alpha" || first.style === "paren") ? first.style : "";
  let i = start;
  const firstIndent = first.indent;
  const stack = [{ indent: firstIndent, items: items, ordered: ordered, style: firstStyle }];

  function current() { return stack[stack.length - 1]; }
  function explicitStyle(style) { return (style === "alpha" || style === "paren") ? style : ""; }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      if (i + 1 < lines.length && looksLikeList(lines[i + 1])) { i++; continue; }
      break;
    }
    const m = parseListMarker(line);
    if (!m) break;
    const indent = m.indent;
    const isOrdered = m.style !== "disc";
    const text = m.text;
    if (indent < firstIndent) break;
    while (stack.length > 1 && indent < current().indent) stack.pop();
    if (indent > current().indent && current().items.length) {
      const lastIndex = current().items.length - 1;
      const parent = current().items[lastIndex];
      const childStyle = explicitStyle(m.style);
      if (typeof parent === "string") {
        current().items[lastIndex] = { text: parent, ordered: isOrdered, children: [], style: childStyle };
      } else {
        if (!parent.children) parent.children = [];
        parent.ordered = isOrdered;
        if (childStyle) parent.style = childStyle;
      }
      stack.push({ indent: indent, items: current().items[current().items.length - 1].children, ordered: isOrdered, style: childStyle });
    }
    current().items.push(text);
    i++;
  }

  function simplify(list) {
    return list.map((item) => {
      if (typeof item === "string") return item;
      if (!item.children || !item.children.length) return item.text || "";
      item.children = simplify(item.children);
      return item;
    });
  }

  const block = { type: "list", ordered: ordered, items: simplify(items) };
  if (firstStyle) block.style = firstStyle;
  return { next: i, block: block };
}

function markdownToBlocks(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  function push(block) {
    blocks.push(Object.assign({ id: newBlockId() }, block));
  }

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) { i++; continue; }

    if (isFence(trimmed)) {
      const mark = trimmed.match(/^(`{3,}|~{3,})/)[1];
      const info = trimmed.slice(mark.length).trim();
      if (info === "compare") {
        const parsed = parseCompareFence(lines, i, mark);
        push(parsed.block);
        i = parsed.next;
        continue;
      }
      i++;
      const body = [];
      while (i < lines.length && lines[i].trim() !== mark) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      push({ type: "code", language: info, text: body.join("\n") });
      continue;
    }

    if (looksLikeHr(trimmed)) { push({ type: "hr" }); i++; continue; }

    if (looksLikeHeading(trimmed)) {
      push({ type: "heading", text: trimmed.replace(/^#{1,6}\s+/, "").trim() });
      i++;
      continue;
    }

    if (trimmed.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const headers = splitTableRow(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|") && !isFence(lines[i]) && !looksLikeHeading(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      push({ type: "table", headers: headers, rows: rows });
      continue;
    }

    if (looksLikeQuote(trimmed)) {
      const qs = [];
      while (i < lines.length && looksLikeQuote(lines[i].trim())) {
        qs.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      push({ type: "quote", text: qs.join("\n") });
      continue;
    }

    if (looksLikeList(raw)) {
      const parsed = parseList(lines, i);
      push(parsed.block);
      i = parsed.next;
      continue;
    }

    const images = parseImageLine(trimmed);
    if (images) {
      for (const img of images) push({ type: "image", caption: img.caption, src: img.src });
      i++;
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim()) {
      const t = lines[i].trim();
      if (para.length && (isFence(t) || looksLikeHeading(t) || looksLikeHr(t) || looksLikeList(lines[i]) || looksLikeQuote(t) || (t.includes("|") && isTableSep(lines[i + 1] || "")))) break;
      para.push(lines[i]);
      i++;
    }
    push({ type: "paragraph", text: para.join("\n") });
  }

  return blocks.length ? blocks : [newBlock("paragraph")];
}

function isElement(node) {
  return !!(node && node.nodeType === 1);
}

function isTextNode(node) {
  return !!(node && node.nodeType === 3);
}

function nodeTag(node) {
  return isElement(node) ? String(node.tagName || "").toLowerCase() : "";
}

function hasClass(node, name) {
  return isElement(node) && node.classList && node.classList.contains(name);
}

function inlineToMarkdown(node) {
  if (!node) return "";
  if (isTextNode(node)) return String(node.nodeValue || "").replace(/\u00a0/g, " ");
  if (!isElement(node)) return "";
  const tag = nodeTag(node);
  if (tag === "br") return "  \n";
  if (tag === "strong" || tag === "b") {
    const inner = inlineChildrenToMarkdown(node).trim();
    return inner ? "**" + inner + "**" : "";
  }
  if (tag === "code") {
    const inner = String(node.textContent || "").replace(/\u00a0/g, " ");
    return inner ? "`" + inner.replace(/`/g, "") + "`" : "";
  }
  if (tag === "span" && hasClass(node, "math")) {
    const inner = String(node.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!inner) return "";
    return inner.indexOf("$") >= 0 ? "$$" + inner + "$$" : "$" + inner + "$";
  }
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    const text = inlineChildrenToMarkdown(node);
    if (!text && !href) return "";
    return "[" + text + "](" + href + ")";
  }
  if (tag === "img") {
    return "![" + (node.getAttribute("alt") || "") + "](" + (node.getAttribute("src") || "") + ")";
  }
  return inlineChildrenToMarkdown(node);
}

function inlineChildrenToMarkdown(node) {
  return Array.from(node.childNodes || []).map(inlineToMarkdown).join("");
}

function listFromElement(el) {
  const style = listStyleFromElement(el);
  const ordered = nodeTag(el) === "ol" || (style && style !== "disc");
  const items = Array.from(el.children || []).filter((child) => nodeTag(child) === "li").map((li) => {
    const nested = [];
    const parts = [];
    Array.from(li.childNodes || []).forEach((child) => {
      if (isElement(child) && (nodeTag(child) === "ul" || nodeTag(child) === "ol")) nested.push(child);
      else parts.push(child);
    });
    const text = parts.map(inlineToMarkdown).join("").replace(/\s+$/, "").replace(/^\s+/, "");
    if (!nested.length) return text;
    const children = [];
    let childOrdered = false;
    let childStyle = "";
    nested.forEach((list) => {
      const sub = listFromElement(list);
      childOrdered = !!sub.ordered;
      if (sub.style) childStyle = sub.style;
      (sub.items || []).forEach((item) => children.push(item));
    });
    const item = { text: text, ordered: childOrdered, children: children };
    if (isExplicitListStyle(childStyle)) item.style = childStyle;
    return item;
  });
  const block = { type: "list", ordered: ordered, items: items };
  if (isExplicitListStyle(style)) block.style = style;
  return block;
}

function tableFromElement(table) {
  const cellText = (cell) => inlineToMarkdown(cell).replace(/\s+$/, "").replace(/^\s+/, "");
  const headers = [];
  const rows = [];
  const theadRows = Array.from(table.querySelectorAll("thead tr"));
  let bodyRows = Array.from(table.querySelectorAll("tbody tr"));
  if (!bodyRows.length) {
    bodyRows = Array.from(table.querySelectorAll("tr")).filter((tr) => !tr.closest("thead"));
  }
  if (theadRows.length) {
    Array.from(theadRows[0].querySelectorAll("th,td")).forEach((cell) => headers.push(cellText(cell)));
  } else if (bodyRows.length) {
    const firstCells = Array.from(bodyRows[0].querySelectorAll("th,td"));
    if (firstCells.length && firstCells.every((cell) => nodeTag(cell) === "th")) {
      firstCells.forEach((cell) => headers.push(cellText(cell)));
      bodyRows.shift();
    }
  }
  bodyRows.forEach((row) => {
    rows.push(Array.from(row.querySelectorAll("th,td")).map(cellText));
  });
  return { type: "table", headers: headers, rows: rows };
}

function compareFromElement(el) {
  const cols = Array.from(el.children || []).filter((child) => hasClass(child, "col"));
  const parseCol = (col) => {
    if (!col) return { tag: "", text: "", cost: "" };
    const tagEl = Array.from(col.querySelectorAll(".tag"))[0];
    const costEl = Array.from(col.querySelectorAll(".cost"))[0];
    const paragraphs = Array.from(col.querySelectorAll("p"));
    return {
      tag: tagEl ? String(tagEl.textContent || "").replace(/\u00a0/g, " ").trim() : "",
      text: paragraphs.map((p) => inlineToMarkdown(p).trim()).filter(Boolean).join("\n"),
      cost: costEl ? inlineToMarkdown(costEl).trim() : ""
    };
  };
  const left = parseCol(cols[0]);
  const right = parseCol(cols[1]);
  return {
    type: "compare",
    leftTag: left.tag,
    rightTag: right.tag,
    left: left.text,
    right: right.text,
    leftCost: left.cost,
    rightCost: right.cost
  };
}

function imageFromElement(fig) {
  const img = fig.querySelector("img");
  const cap = fig.querySelector("figcaption");
  const src = img ? (img.getAttribute("src") || "") : "";
  let caption = cap ? String(cap.textContent || "").replace(/\u00a0/g, " ").trim() : "";
  if (!caption && img) caption = img.getAttribute("alt") || "";
  return { type: "image", src: src, caption: caption };
}

function isBlockish(node) {
  if (!isElement(node)) return false;
  const tag = nodeTag(node);
  if (/^(p|h1|h2|h3|h4|h5|h6|ul|ol|pre|table|figure|hr|blockquote)$/.test(tag)) return true;
  return hasClass(node, "compare") || hasClass(node, "table-wrap") || hasClass(node, "article");
}

function htmlToBlocks(root) {
  const blocks = [];
  if (!root) return blocks;
  const container = hasClass(root, "article") || (root.getAttribute && root.getAttribute("id") === "mdEditor")
    ? root
    : (root.querySelector ? (root.querySelector(".article") || root) : root);

  function pushParagraph(text) {
    const cleaned = String(text || "").replace(/[ \t]+\n/g, "  \n").replace(/^\s+|\s+$/g, "");
    if (cleaned) blocks.push({ type: "paragraph", text: cleaned });
  }

  function walk(nodes) {
    Array.from(nodes || []).forEach((node) => {
      if (isTextNode(node)) {
        const text = String(node.nodeValue || "").replace(/\u00a0/g, " ");
        if (text.trim()) pushParagraph(text);
        return;
      }
      if (!isElement(node)) return;
      const tag = nodeTag(node);
      if (tag === "div" && hasClass(node, "article") && node !== container) {
        walk(node.childNodes);
        return;
      }
      if (/^h[1-6]$/.test(tag)) {
        blocks.push({ type: "heading", text: inlineToMarkdown(node).trim() });
        return;
      }
      if (tag === "blockquote" || (tag === "p" && hasClass(node, "quote"))) {
        const text = inlineToMarkdown(node).trim();
        if (text) blocks.push({ type: "quote", text: text });
        return;
      }
      if (tag === "pre") {
        const code = node.querySelector("code") || node;
        const langMatch = String(code.className || "").match(/language-([\w-]+)/);
        let text = String(code.textContent || "").replace(/\u00a0/g, " ");
        if (text.startsWith("\n")) text = text.slice(1);
        if (text.endsWith("\n")) text = text.slice(0, -1);
        blocks.push({ type: "code", language: langMatch ? langMatch[1] : "", text: text });
        return;
      }
      if (tag === "ul" || tag === "ol") {
        blocks.push(listFromElement(node));
        return;
      }
      if (tag === "div" && hasClass(node, "table-wrap")) {
        const table = node.querySelector("table");
        if (table) blocks.push(tableFromElement(table));
        return;
      }
      if (tag === "table") {
        blocks.push(tableFromElement(node));
        return;
      }
      if (tag === "div" && hasClass(node, "compare")) {
        blocks.push(compareFromElement(node));
        return;
      }
      if (tag === "figure") {
        blocks.push(imageFromElement(node));
        return;
      }
      if (tag === "hr") {
        blocks.push({ type: "hr" });
        return;
      }
      if (tag === "p" || tag === "div" || tag === "li") {
        const hasBlocks = Array.from(node.children || []).some(isBlockish);
        if (hasBlocks) {
          const leading = [];
          Array.from(node.childNodes || []).forEach((child) => {
            if (isBlockish(child)) {
              if (leading.length) {
                pushParagraph(leading.map(inlineToMarkdown).join(""));
                leading.length = 0;
              }
              walk([child]);
            } else {
              leading.push(child);
            }
          });
          if (leading.length) pushParagraph(leading.map(inlineToMarkdown).join(""));
          return;
        }
        const text = inlineToMarkdown(node);
        const hasImg = !!node.querySelector && node.querySelector("img");
        if (hasImg && !text.trim()) {
          const img = node.querySelector("img");
          blocks.push({ type: "image", src: img.getAttribute("src") || "", caption: img.getAttribute("alt") || "" });
          return;
        }
        pushParagraph(text);
        return;
      }
      if (Array.from(node.children || []).some(isBlockish)) walk(node.childNodes);
      else pushParagraph(inlineToMarkdown(node));
    });
  }

  walk(container.childNodes);
  return blocks;
}

// ---- 导学清单：把列表条目匹配到知识点（渲染时计算，内容编辑后依然有效） ----
function normalizeTopicText(value) {
  return String(value == null ? "" : value)
    .replace(/^\s*\d+\s*[\.．、]\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function topicBigrams(text) {
  const grams = [];
  for (let i = 0; i < text.length - 1; i += 1) grams.push(text.slice(i, i + 2));
  return grams;
}

function topicSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shortLen = Math.min(a.length, b.length);
  const longLen = Math.max(a.length, b.length);
  if (shortLen >= 4 && (a.includes(b) || b.includes(a))) return 0.75 + 0.25 * (shortLen / longLen);
  const ga = topicBigrams(a);
  const gb = topicBigrams(b);
  if (!ga.length || !gb.length) return 0;
  const pool = new Map();
  gb.forEach((g) => pool.set(g, (pool.get(g) || 0) + 1));
  let hit = 0;
  ga.forEach((g) => {
    const n = pool.get(g) || 0;
    if (n > 0) { hit += 1; pool.set(g, n - 1); }
  });
  return (2 * hit) / (ga.length + gb.length);
}

// 根据导学小标题（如 "Java集合"、"Spring/SpringBoot"）找对应章节
function guideHeadingCategories(heading, categories) {
  const h = normalizeTopicText(String(heading || "").replace(/[（(][^）)]*[）)]/g, ""));
  if (!h) return [];
  const cats = (categories || []).filter((c) => c.id !== "guide");
  const strict = cats.filter((c) => {
    const n = normalizeTopicText(c.name);
    return n && (n === h || n.includes(h) || h.includes(n));
  });
  if (strict.length) return strict.map((c) => c.id);
  return cats.filter((c) => topicSimilarity(normalizeTopicText(c.name), h) >= 0.6).map((c) => c.id);
}

// 一个标题的几种比较形式：原文、去掉括号注释、"Kafka/RabbitMQ/RocketMQ的…" 只取第一个
function topicTextVariants(value) {
  const raw = String(value == null ? "" : value).replace(/^\s*\d+\s*[\.．、]\s*/, "");
  const forms = [raw, raw.replace(/[（(][^）)]*[）)]/g, ""), raw.replace(/^([A-Za-z]+)(?:\s*\/\s*[A-Za-z]+)+/, "$1")];
  const out = [];
  forms.forEach((f) => {
    const n = normalizeTopicText(f);
    if (n && !out.includes(n)) out.push(n);
  });
  return out;
}

function bestTopicSimilarity(itemForms, title) {
  const titleForms = topicTextVariants(title);
  let best = 0;
  itemForms.forEach((a) => titleForms.forEach((b) => {
    const s = topicSimilarity(a, b);
    if (s > best) best = s;
  }));
  return best;
}

// 返回 { topic, score } 或 null
function matchGuideItem(text, headingCats, topics, minScore, onlyCats) {
  const raw = String(text || "");
  const forms = topicTextVariants(raw);
  if (!forms.length || forms[0].length < 2) return null;
  const numMatch = raw.match(/^\s*(\d+)\s*[\.．、]/);
  const num = numMatch ? Number(numMatch[1]) : 0;
  const cats = headingCats || [];
  const order = {};
  let best = null;
  (topics || []).forEach((t) => {
    if (t.categoryId === "guide") return;
    order[t.categoryId] = (order[t.categoryId] || 0) + 1;
    const idx = order[t.categoryId];
    if (onlyCats && onlyCats.length && !onlyCats.includes(t.categoryId)) return;
    let score = bestTopicSimilarity(forms, t.title);
    if (score <= 0) return;
    if (cats.includes(t.categoryId)) score += 0.1;
    if (num && cats.includes(t.categoryId) && idx === num) score += 0.05;
    if (!best || score > best.score) best = { topic: t, score };
  });
  return best && best.score >= (minScore || 0.62) ? best : null;
}

// 导学条目 → 片段列表 [{ text, topic|null }]。"A / B / C" 这种合并条目会拆开分别跳转。
function linkGuideItem(text, headingCats, topics, categories) {
  const raw = String(text || "");
  const whole = matchGuideItem(raw, headingCats, topics);
  if (whole && whole.score >= 0.9) return [{ text: raw, topic: whole.topic }];
  const body = raw.replace(/^\s*\d+\s*[\.．、]\s*/, "");
  const parts = body.split(/\s+\/\s*|\s*\/\s+/).filter((p) => p.trim());
  if (parts.length > 1) {
    const hits = parts.map((p) => {
      // 片段里点名了某个章节（如 "RabbitMQ的死信队列"），就只在该章节里找
      const np = normalizeTopicText(p);
      const named = (categories || []).filter((c) => {
        const n = normalizeTopicText(c.name);
        return c.id !== "guide" && n.length >= 3 && np.includes(n);
      });
      if (named.length) {
        let stripped = p;
        named.forEach((c) => { stripped = stripped.split(c.name).join(""); });
        stripped = stripped.replace(/^[\s的]+/, "").replace(/[（(]\s*[）)]/g, "");
        const ids = named.map((c) => c.id);
        const a = matchGuideItem(p, ids, topics, 0.5, ids);
        const b = matchGuideItem(stripped, ids, topics, 0.5, ids);
        return (a && (!b || a.score >= b.score)) ? a : b;
      }
      return matchGuideItem(p, headingCats, topics, 0.75);
    });
    if (hits.filter(Boolean).length >= 2) {
      const prefix = raw.slice(0, raw.length - body.length);
      return parts.map((p, i) => ({ text: (i === 0 ? prefix : "") + p.trim(), topic: hits[i] ? hits[i].topic : null }));
    }
  }
  return [{ text: raw, topic: whole ? whole.topic : null }];
}
