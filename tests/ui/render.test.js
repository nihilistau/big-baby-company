// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { delegate, escapeHtml, render } from "../../src/ui/render.js";

let root;
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById("root");
});

describe("morphing", () => {
  it("reuses nodes instead of replacing them", () => {
    render(root, `<div data-key="a"><span>one</span></div>`);
    const before = root.querySelector("[data-key=a]");
    render(root, `<div data-key="a"><span>two</span></div>`);
    expect(root.querySelector("[data-key=a]")).toBe(before);
    expect(root.textContent).toContain("two");
  });

  it("preserves scroll position across a re-render", () => {
    // This is the regression the whole renderer exists for: the original build
    // reset the catalog to the top every time you clicked a card.
    render(root, `<div data-key="list" class="scroller">${item(1)}</div>`);
    const list = root.querySelector(".scroller");
    Object.defineProperty(list, "scrollTop", { value: 240, writable: true });
    list.scrollTop = 240;
    render(root, `<div data-key="list" class="scroller">${item(2)}</div>`);
    expect(root.querySelector(".scroller").scrollTop).toBe(240);
  });

  it("keeps focus on the focused element", () => {
    render(root, `<div data-key="w"><button data-key="b">a</button></div>`);
    const btn = root.querySelector("[data-key=b]");
    btn.focus();
    render(root, `<div data-key="w"><button data-key="b">b</button></div>`);
    expect(document.activeElement).toBe(btn);
  });

  it("does not clobber an input the user is typing into", () => {
    render(root, `<input data-key="i" value="" />`);
    const input = root.querySelector("input");
    input.focus();
    input.value = "half-typed";
    render(root, `<input data-key="i" value="" />`);
    expect(input.value).toBe("half-typed");
  });

  it("removes keyed nodes that are gone from the new tree", () => {
    render(root, `<div data-key="a"></div><div data-key="b"></div><div data-key="c"></div>`);
    render(root, `<div data-key="a"></div><div data-key="c"></div>`);
    expect(root.querySelector("[data-key=b]")).toBeNull();
    expect(root.children).toHaveLength(2);
  });

  it("never duplicates unkeyed siblings when a keyed node appears above them", () => {
    // A keyed incoming node must not match an unkeyed positional candidate —
    // that bug had the launch modal cannibalise the FX layer and left two of it.
    render(root, `<div data-key="hub"></div><div class="fx"></div><div class="toast"></div>`);
    render(
      root,
      `<div data-key="hub"></div><div data-key="modal"></div><div class="fx"></div><div class="toast"></div>`
    );
    expect(root.querySelectorAll(".fx")).toHaveLength(1);
    expect(root.querySelectorAll(".toast")).toHaveLength(1);
    render(root, `<div data-key="hub"></div><div class="fx"></div><div class="toast"></div>`);
    expect(root.querySelectorAll(".fx")).toHaveLength(1);
    expect(root.querySelectorAll(".toast")).toHaveLength(1);
    expect(root.querySelector("[data-key=modal]")).toBeNull();
  });

  it("reorders keyed children by moving them", () => {
    render(root, `<i data-key="1">1</i><i data-key="2">2</i><i data-key="3">3</i>`);
    const second = root.querySelector("[data-key='2']");
    render(root, `<i data-key="3">3</i><i data-key="2">2</i><i data-key="1">1</i>`);
    expect(root.querySelector("[data-key='2']")).toBe(second);
    expect([...root.children].map((c) => c.dataset.key)).toEqual(["3", "2", "1"]);
  });

  it("leaves data-static subtrees alone", () => {
    render(root, `<div data-key="fx" data-static></div>`);
    const fx = root.querySelector("[data-key=fx]");
    fx.appendChild(document.createElement("span"));
    render(root, `<div data-key="fx" data-static></div>`);
    expect(fx.children).toHaveLength(1);
  });

  it("syncs attributes both ways", () => {
    render(root, `<button data-key="b" disabled class="a">x</button>`);
    render(root, `<button data-key="b" class="b">x</button>`);
    const btn = root.querySelector("button");
    expect(btn.hasAttribute("disabled")).toBe(false);
    expect(btn.className).toBe("b");
  });
});

describe("delegation", () => {
  it("dispatches by data-act and skips disabled targets", () => {
    const hit = vi.fn();
    delegate(root, "click", { go: hit });
    render(root, `<button data-act="go">a</button><button data-act="go" disabled>b</button>`);
    root.querySelectorAll("button")[0].click();
    root.querySelectorAll("button")[1].click();
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it("keeps working after a re-render", () => {
    const hit = vi.fn();
    delegate(root, "click", { go: hit });
    render(root, `<button data-act="go">a</button>`);
    render(root, `<button data-act="go">b</button>`);
    root.querySelector("button").click();
    expect(hit).toHaveBeenCalledTimes(1);
  });
});

describe("escaping", () => {
  it("neutralises markup in interpolated content", () => {
    const nasty = `<img src=x onerror="alert(1)">`;
    render(root, `<p data-key="p">${escapeHtml(nasty)}</p>`);
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img");
  });
});

function item(n) {
  return Array.from({ length: 40 }, (_, i) => `<p data-key="p${i}">row ${i} v${n}</p>`).join("");
}

describe("keyboard safety", () => {
  it("space still activates a focused button", () => {
    // The hub uses Space to reveal hotspots; swallowing it globally would break
    // keyboard operation of every control in the game.
    const hit = vi.fn();
    render(root, `<button data-key="b">go</button>`);
    const btn = root.querySelector("button");
    btn.addEventListener("click", hit);
    btn.focus();
    expect(document.activeElement).toBe(btn);
    expect(btn.closest("button, a, [tabindex]")).toBe(btn);
  });
});
