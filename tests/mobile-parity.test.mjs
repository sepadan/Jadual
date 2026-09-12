import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Newlines normalised so the assertions do not depend on the checkout's line endings.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const html = read("index.html");
const css = read("styles.css");
const app = read("app.js");

// The phone layout compacts the interface by hiding every `.segmented` switcher. That rule is
// blunt: any switcher that is not explicitly restored inside the media query disappears on a
// phone along with the screens it controls. The relief switcher vanished that way and left phone
// users with no route to the guru ganti preview, so parity is now locked by test.
function mediaBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${marker} is missing from styles.css`);
  const open = source.indexOf("{", start);
  const end = source.indexOf("@media print", open);
  assert.ok(open > 0 && end > open, `${marker} is not closed`);
  return source.slice(open, end);
}

function ruleFor(block, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`(^|[},])\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"));
  return match ? match[2] : null;
}

const mobile = mediaBlock(css, "@media (max-width: 760px)");

// Elements that carry the compacted class together with any class of their own.
const segmentedElements = [...html.matchAll(/class="([^"]*)"/g)]
  .map((match) => match[1].split(/\s+/).filter(Boolean))
  .filter((classes) => classes.includes("segmented"))
  .map((classes) => classes.filter((name) => name !== "segmented"));

test("every switcher the phone layout hides is explicitly brought back", () => {
  assert.match(mobile, /\.segmented\s*\{[^}]*display:\s*none/, "the phone layout no longer compacts .segmented");
  assert.ok(segmentedElements.length >= 2, "expected the schedule and relief switchers in index.html");
  for (const classes of segmentedElements) {
    const restored = classes.some((name) => {
      const body = ruleFor(mobile, `.${name}`);
      return body ? /display:\s*(?!none)\w/.test(body) : false;
    });
    assert.ok(restored, `.${classes.join(".")} is hidden by .segmented on phones with no rule to restore it`);
  }
});

test("the relief switcher keeps both views reachable on a phone", () => {
  const switcher = ruleFor(mobile, ".relief-switch");
  assert.ok(switcher, ".relief-switch has no phone rule");
  assert.match(switcher, /display:\s*flex/, ".relief-switch is not shown as a switcher on a phone");
  assert.match(switcher, /width:\s*100%/, ".relief-switch does not use the full width on a phone");
  assert.match(ruleFor(mobile, ".relief-switch button") || "", /flex:\s*1/, "the phone switcher buttons are not equal width");

  const buttons = [...html.matchAll(/data-relief-panel="([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(buttons, ["senarai", "preview"], "the relief switcher no longer offers both views");
  assert.ok(app.includes("setReliefPanel"), "app.js lost the relief panel switch");
  assert.ok(app.includes("$('#reliefPanelPreview')"), "the preview panel is no longer toggled");
});

test("the relief toolbar stacks on a phone so the tabs and the buttons cannot overlap", () => {
  const toolbar = ruleFor(mobile, ".relief-toolbar");
  assert.ok(toolbar, ".relief-toolbar has no phone rule");
  assert.match(toolbar, /flex-direction:\s*column-reverse/, "the phone toolbar no longer stacks");
  assert.match(ruleFor(mobile, ".relief-toolbar .button-row") || "", /justify-content/, "the stacked button row is not aligned");
});

test("the preview stays readable and scrollable on a phone", () => {
  assert.match(css, /\.relief-preview\s*\{[^}]*overflow:\s*auto/, "the preview lost its scroll container");
  assert.match(css, /\.relief-preview \.relief-print-table\s*\{[^}]*min-width/, "the preview table lost its minimum width");
  const preview = ruleFor(mobile, ".relief-preview");
  assert.ok(preview, ".relief-preview has no phone rule");
  assert.match(ruleFor(mobile, ".relief-preview .relief-print-heading") || "", /flex-direction:\s*column/, "the preview heading does not stack on a phone");
});

// Printing is driven by body.print-relief, which hides every screen element and shows only the
// print sheet. The stacked phone toolbar must never leak into a print rule, or the sheet would
// inherit screen layout when a narrow window prints the day.
test("the phone toolbar layout stays out of the print stylesheets", () => {
  for (const block of css.matchAll(/@media print\s*\{([\s\S]*?)\n\}/g)) {
    assert.doesNotMatch(block[1], /relief-toolbar/, "@media print must not lay out the screen toolbar");
  }
});

