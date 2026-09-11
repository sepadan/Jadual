import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// Executes the real arrow-key helper instead of grepping for it: both reviewers of this change
// flagged `tabs.indexOf` and missing focus as runtime defects, and only running the function can
// settle whether they are right. `$$` is the app's own helper (it spreads querySelectorAll into
// an array), so it is provided here exactly as app.js defines it.
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const body = app.slice(app.indexOf("function moveTabFocus("), app.indexOf("function updateDraftActions("));

function harness(tabCount) {
  const events = [];
  const tabs = Array.from({ length: tabCount }, (_, index) => ({
    id: `tab-${index}`,
    focused: false,
    clicked: false,
    focus() { this.focused = true; events.push(`focus:${this.id}`); },
    click() { this.clicked = true; events.push(`click:${this.id}`); document.activeElement = this; },
  }));
  const list = { id: 'tablist', querySelectorAll: (selector) => (selector === '[role="tab"]' ? tabs : []) };
  const document = { activeElement: tabs[0], querySelectorAll: () => [] };
  const context = vm.createContext({
    document,
    $$: (selector, root = document) => [...root.querySelectorAll(selector)],
  });
  vm.runInContext(body, context);
  return { context, tabs, list, events, document };
}

test("arrow keys rotate through the tabs of one list and stop at the end", () => {
  const { context, tabs, list, document } = harness(3);
  assert.equal(context.moveTabFocus(list, "ArrowRight"), tabs[1]);
  assert.equal(document.activeElement, tabs[1], "the newly selected tab takes focus");
  assert.equal(tabs[1].clicked, true, "selecting the tab also activates it");
  assert.equal(context.moveTabFocus(list, "ArrowRight"), tabs[2]);
  assert.equal(context.moveTabFocus(list, "ArrowRight"), tabs[0], "wraps back to the first tab");
  assert.equal(context.moveTabFocus(list, "ArrowLeft"), tabs[2], "moves backwards from the first tab");
});

test("navigation does nothing when focus is not inside that tablist", () => {
  const { context, list, document } = harness(2);
  document.activeElement = { id: "somewhere-else" };
  assert.equal(context.moveTabFocus(list, "ArrowRight"), null);
});

test("a single-tab list is left alone", () => {
  const { context, list } = harness(1);
  assert.equal(context.moveTabFocus(list, "ArrowRight"), null);
});
