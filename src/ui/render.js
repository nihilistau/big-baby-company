/**
 * Minimal DOM morphing.
 *
 * The original build did `app.innerHTML = ...` on every interaction, which
 * threw away scroll position, focus and any in-flight input every time you
 * clicked a card. This walks the old and new trees in parallel and mutates
 * only what actually differs, so nodes — and therefore scroll, focus, CSS
 * transitions and drag state — survive a re-render.
 *
 * ~150 lines, no dependencies. Keyed children (`data-key`) are matched by key
 * so reordering a list moves nodes instead of rewriting them.
 */

const TEMPLATE = document.createElement("template");

export function html(strings, ...values) {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += stringify(values[i]);
  });
  return out;
}

function stringify(v) {
  if (v == null || v === false) return "";
  if (Array.isArray(v)) return v.map(stringify).join("");
  return String(v);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Replace `root`'s children with `markup`, reusing nodes wherever possible. */
export function render(root, markup) {
  TEMPLATE.innerHTML = markup;
  morphChildren(root, TEMPLATE.content);
}

function keyOf(node) {
  return node.nodeType === 1 ? node.getAttribute("data-key") : null;
}

function sameType(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType === 1) return a.tagName === b.tagName;
  return true;
}

function morphChildren(oldParent, newParent) {
  const newNodes = Array.from(newParent.childNodes);

  // Index existing keyed children so a reorder moves nodes rather than
  // rebuilding them. A keyed *new* node may only ever match a keyed old node
  // with the same key — falling back to positional matching here is how an
  // incoming modal ends up cannibalising the FX layer.
  const keyed = new Map();
  for (const node of Array.from(oldParent.childNodes)) {
    const k = keyOf(node);
    if (k != null && !keyed.has(k)) keyed.set(k, node);
  }

  let cursor = 0;
  for (const incoming of newNodes) {
    const key = keyOf(incoming);
    let match = null;

    if (key != null) {
      match = keyed.get(key) || null;
      if (match) keyed.delete(key);
    } else {
      const candidate = oldParent.childNodes[cursor];
      if (candidate && keyOf(candidate) == null && sameType(candidate, incoming)) {
        match = candidate;
      }
    }

    if (match) {
      if (match !== oldParent.childNodes[cursor]) {
        oldParent.insertBefore(match, oldParent.childNodes[cursor] || null);
      }
      morphNode(match, incoming);
    } else {
      oldParent.insertBefore(
        document.importNode(incoming, true),
        oldParent.childNodes[cursor] || null
      );
    }
    cursor++;
  }

  // Everything from the cursor on is surplus: nodes the new tree no longer
  // has, including keyed ones that were not re-matched.
  while (oldParent.childNodes.length > cursor) {
    oldParent.removeChild(oldParent.childNodes[cursor]);
  }
}

function morphNode(oldNode, newNode) {
  if (oldNode.nodeType === 3 || oldNode.nodeType === 8) {
    if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue;
    return;
  }
  if (oldNode.nodeType !== 1) return;

  // A node explicitly marked static is never touched again — used for the
  // canvas-backed FX layer and anything owning its own imperative state.
  if (oldNode.hasAttribute("data-static")) return;

  morphAttributes(oldNode, newNode);

  // Form controls: never clobber what the player is currently typing/dragging.
  const active = document.activeElement;
  if (oldNode === active && (oldNode.tagName === "INPUT" || oldNode.tagName === "TEXTAREA")) {
    return;
  }
  if (oldNode.tagName === "INPUT") {
    const want = newNode.getAttribute("value");
    if (want != null && oldNode.value !== want) oldNode.value = want;
    if (oldNode.type === "checkbox" || oldNode.type === "radio") {
      oldNode.checked = newNode.hasAttribute("checked");
    }
  }

  morphChildren(oldNode, newNode);
}

function morphAttributes(oldNode, newNode) {
  const seen = new Set();
  for (const attr of Array.from(newNode.attributes)) {
    seen.add(attr.name);
    if (oldNode.getAttribute(attr.name) !== attr.value) {
      oldNode.setAttribute(attr.name, attr.value);
    }
  }
  for (const attr of Array.from(oldNode.attributes)) {
    if (!seen.has(attr.name)) oldNode.removeAttribute(attr.name);
  }
}

// --- Event delegation -----------------------------------------------------

/**
 * One listener per event type on the root, dispatching by `data-act`. Survives
 * morphing for free — no rebinding after every render.
 */
export function delegate(root, type, handlers) {
  root.addEventListener(type, (event) => {
    const el = event.target.closest?.("[data-act]");
    if (!el || !root.contains(el)) return;
    const name = el.getAttribute("data-act");
    const handler = handlers[name];
    if (!handler) return;
    if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return;
    handler(el, event);
  });
}

/** Remember and restore scroll for containers that survive a screen change. */
const scrollMemory = new Map();

export function rememberScroll(root) {
  root.querySelectorAll("[data-scroll]").forEach((el) => {
    scrollMemory.set(el.getAttribute("data-scroll"), el.scrollTop);
  });
}

export function restoreScroll(root) {
  root.querySelectorAll("[data-scroll]").forEach((el) => {
    const saved = scrollMemory.get(el.getAttribute("data-scroll"));
    if (saved != null && el.scrollTop !== saved) el.scrollTop = saved;
  });
}
