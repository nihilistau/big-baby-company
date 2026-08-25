/**
 * Screen feedback. Everything here is decorative and lives outside the morphed
 * tree (the FX layer is marked `data-static`), so animations are never
 * interrupted by a re-render and the sim never waits on one.
 */
const reduced =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function layer(root) {
  return root.querySelector(".fx-layer");
}

export function burst(root, event, count = 10) {
  if (reduced) return;
  const host = layer(root);
  if (!host || !event) return;
  const x = event.clientX;
  const y = event.clientY;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "particle";
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 26 + Math.random() * 46;
    p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    host.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}

export function floatText(root, event, text, kind = "info") {
  const host = layer(root);
  if (!host) return;
  const el = document.createElement("span");
  el.className = `float ${kind}`;
  el.textContent = text;
  el.style.left = `${event?.clientX ?? window.innerWidth / 2}px`;
  el.style.top = `${event?.clientY ?? 120}px`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

export function flash(root, kind = "") {
  if (reduced) return;
  const host = layer(root);
  if (!host) return;
  const el = document.createElement("div");
  el.className = `screen-flash ${kind}`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 620);
}

/** Count a number up in an element. Purely cosmetic; the value is already final. */
export function rollNumber(el, to, duration = 900) {
  if (!el) return;
  if (reduced) {
    el.textContent = Math.round(to).toLocaleString("en-US");
    return;
  }
  const start = performance.now();
  const from = 0;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * eased).toLocaleString("en-US");
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
